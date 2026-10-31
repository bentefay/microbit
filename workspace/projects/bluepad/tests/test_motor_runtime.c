// Exercise the actual I2C worker against a moving cumulative encoder.
#include <assert.h>
#include <setjmp.h>
#include <stdarg.h>
#include "motor_drive.c"
static jmp_buf finished;
static unsigned step, position_writes, after_stop, stops, reads;
static uint32_t time_ms;
static int scenario, raw, physical_target, max_raw, min_raw;
static bool moving, fail_read, stop_observed;
int printk(const char *format,...) { (void)format; return 0; }
uint32_t k_uptime_get_32(void) { return time_ms; }
int k_sem_take(struct k_sem *sem,int timeout) { (void)sem; (void)timeout; return 0; }
void k_sem_give(struct k_sem *sem) { (void)sem; }
void k_msleep(int ms) {
    time_ms+=(unsigned)ms;
    if (ms!=10) return;
    if (moving) {
        int delta=physical_target-raw;
        raw+=delta>50?50:delta< -50?-50:delta;
        if (raw>max_raw) max_raw=raw;
        if (raw<min_raw) min_raw=raw;
    }
    step++;
    if (step==1) motor_drive_settings((motor_settings_t){20,0,360});
    pending=(drive_input_t){.present=true,.owner=0,.received=time_ms};
    if (step>=3) pending.x=511;
    if (scenario==0) {
        if (step>=120) pending.x=-512;
        if (step>=310) pending.x=0;
        if (step==420) longjmp(finished,1);
    } else {
        if (step==20) {
            if (scenario==1) fail_read=true;
            if (scenario==2) raw+=10000;
            if (scenario==3) motor_drive_abort();
            if (scenario==4) motor_drive_save_request(true);
        }
        if (scenario==4 && step>=20) pending.x=0;
        if (step==60) longjmp(finished,1);
    }
}
int i2c_write(const struct device *dev,const uint8_t *p,size_t n,uint16_t address) {
    (void)dev; assert(n==8 && address==0x10);
    if (p[2]==2 && p[4]==0x5d) {
        assert(p[6]==1);
        int angle=(p[5]<<8)|p[7]; assert(angle<360);
        int delta=drive_angle(angle-raw/10+180)-180;
        assert(delta>=-75 && delta<=75); // includes travel since last sample
        physical_target=raw+delta*10; moving=true; position_writes++;
        if (stop_observed) after_stop++;
    }
    if (p[2]==2 && p[4]==0x5f) {
        moving=false; stops++;
        if (step>=20 && scenario!=0) stop_observed=true;
    }
    return 0;
}
int i2c_read(const struct device *dev,uint8_t *p,size_t n,uint16_t address) {
    (void)dev; assert(n==4 && address==0x10); reads++;
    if (fail_read) return -EIO;
    uint32_t bits=(uint32_t)raw;
    for (unsigned i=0;i<4;i++) p[i]=(uint8_t)(bits>>(8*i));
    return 0;
}
int main(void) {
    for (scenario=0;scenario<5;scenario++) {
        step=position_writes=after_stop=stops=reads=time_ms=0;
        raw=physical_target=max_raw=min_raw=0;
        moving=fail_read=stop_observed=false;
        started=aborted=boot_ready=settings_ready=save_requested=save_ready=0;
        pending=(drive_input_t){.owner=-1}; runtime_settings=(motor_settings_t){0};
        if (setjmp(finished)==0) worker(NULL,NULL,NULL);
        assert(reads>2 && position_writes>1);
        if (scenario==0) {
            assert(error==0 && max_raw==3600 && min_raw==-3600 && raw==0);
        } else {
            assert(stop_observed && !moving && after_stop==0);
            if (scenario==1) assert(error==-EIO);
            if (scenario==2) assert(error==-ERANGE);
            if (scenario==3) assert(error==0 && atomic_get(&aborted));
            if (scenario==4) assert(error==0 && motor_drive_save_ready());
        }
    }
}

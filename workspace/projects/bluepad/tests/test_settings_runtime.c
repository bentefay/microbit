// Exercise the real adapter against a fake flash bank and motor handshake.
#include <assert.h>
#include <stdarg.h>
#include <stdio.h>
#include "settings.c"
static bool fake_boot, fake_requested, fake_ready, fail_store;
static unsigned store_calls, fake_size, sound_calls;
static uint8_t fake_record[SETTINGS_BYTES];
static motor_settings_t applied;
static char last_log[200];
static uint32_t fake_time;
static const uint8_t blue[6]={0x5c,0xba,0x37,0xdd,0xd9,0x6c};
int printk(const char *format, ...) {
    va_list args; va_start(args,format); vsnprintf(last_log,sizeof(last_log),format,args); va_end(args); return 0;
}
uint32_t btstack_run_loop_get_time_ms(void) { return fake_time; }
bool motor_drive_boot(int *center, int32_t *raw) { *center=350; *raw=3500; return fake_boot; }
void motor_drive_settings(motor_settings_t s) { assert(settings_valid(s)); applied=s; }
void motor_drive_save_request(bool value) { fake_requested=value; }
bool motor_drive_save_ready(void) { return fake_ready; }
void joystick_matrix_frame(const uint8_t frame[25]) { assert(frame); }
void settings_audio(settings_event_t event, unsigned selected) { assert(event!=SET_NONE && selected<3); sound_calls++; }
int settings_audio_status(void) { return 0; }
void settings_audio_telemetry(uint32_t now) { (void)now; }
static int fake_get(void *ctx,uint32_t tag,uint8_t *data,uint32_t size) {
    (void)ctx; assert(tag==SETTINGS_TAG);
    if (!data) { assert(size==0); return (int)fake_size; }
    assert(size==SETTINGS_BYTES);
    unsigned copied=fake_size<size?fake_size:size;
    memcpy(data,fake_record,copied); return (int)copied;
}
static int fake_store(void *ctx,uint32_t tag,const uint8_t *data,uint32_t size) {
    (void)ctx;
    assert(fake_requested && fake_ready && tag==SETTINGS_TAG && size==SETTINGS_BYTES);
    store_calls++;
    // HAL failure may be logged but not returned by BTstack: require readback.
    if (!fail_store) { memcpy(fake_record,data,size); fake_size=size; }
    return 0;
}
void btstack_tlv_get_instance(const btstack_tlv_t **impl,void **ctx) {
    static const btstack_tlv_t fake={fake_get,fake_store,NULL}; *impl=&fake; *ctx=NULL;
}
static void keys(uint8_t dpad,uint8_t misc) {
    settings_input(blue,0,0,fake_time++);
    settings_input(blue,dpad,misc,fake_time++);
}
static void tick(void) { settings_tick(fake_time++,true); }
int main(void) {
    settings_init(false); tick(); assert(!settings_active() && !fake_requested && !store_calls);
    fake_boot=true; tick(); assert(applied.speed==20 && applied.center==350 && applied.range==45);
    settings_input(blue,0,4,fake_time++); assert(!settings_active()); // first held Menu ignored
    keys(0,4); assert(settings_active()); keys(1,0); assert(applied.speed==25);
    keys(0,4); assert(!settings_active()); tick(); assert(fake_requested && !store_calls);
    for (unsigned i=0;i<100;i++) tick(); // drive still moving: no acknowledgement
    assert(store_calls==0);
    fake_ready=true; tick(); assert(store_calls==1 && !fake_requested);
    motor_settings_t stored; assert(settings_decode(fake_record,fake_size,350,&stored) && stored.speed==25);
    keys(0,4); keys(1,0); keys(0,2); assert(applied.speed==25 && !settings_active());
    tick(); assert(store_calls==1); // cancel never writes
    keys(0,4); keys(0,4); tick(); assert(store_calls==1); // unchanged save never writes
    keys(0,4); keys(1,0); keys(2,0); keys(0,4); tick();
    assert(store_calls==1); // edited then restored before save: no flash write
    keys(0,4); keys(1,0); keys(0,4); tick();
    assert(!fake_requested && store_calls==1); // stale acknowledgement cannot authorize a new save
    fake_ready=false; tick(); assert(fake_requested);
    keys(0,4); tick(); assert(!fake_requested); // re-enter pauses a deferred save
    keys(1,0); settings_disconnect(blue); assert(applied.speed==30 && !settings_active());
    tick(); assert(fake_requested); fake_ready=true; fail_store=true; tick();
    assert(store_calls==2 && !fake_requested && strstr(last_log,"store-error"));
    fake_ready=false; for (unsigned i=0;i<100;i++) tick(); assert(!fake_requested);
    fake_time+=5000; tick(); assert(fake_requested);
    fake_ready=true; fail_store=false; tick(); assert(store_calls==3 && !fake_requested);
    assert(settings_decode(fake_record,fake_size,350,&stored) && stored.speed==30);
    assert(sound_calls>0);
    // Simulated reboot with a persisted record, then factory reset.
    initialized=false; fake_ready=false; fake_size=SETTINGS_BYTES+1;
    settings_init(false); tick(); assert(applied.speed==20);
    fake_size=SETTINGS_BYTES;
    initialized=false; fake_ready=false; settings_init(false); tick(); assert(applied.speed==30);
    initialized=false; settings_init(true); tick(); assert(applied.speed==20 && fake_requested);
    fake_ready=true; tick(); assert(store_calls==4);
    assert(settings_decode(fake_record,fake_size,350,&stored) && stored.speed==20 && stored.range==45);
    fake_ready=false;
    // A value accepted earlier but still pending is also cancelled if changed
    // back to flash's value before its stop acknowledgement arrives.
    keys(0,4); keys(1,0); keys(0,4); tick(); assert(fake_requested);
    keys(0,4); keys(2,0); keys(0,4); tick(); assert(!fake_requested && store_calls==4);
    // If flash already holds a requested record (e.g. retry after an ambiguous
    // readback), do not append another copy even with a stale cached baseline.
    keys(0,4); keys(1,0); keys(0,4); tick(); assert(fake_requested);
    settings_encode((motor_settings_t){25,350,45},350,fake_record);
    fake_ready=true; tick(); assert(store_calls==4 && !fake_requested);
    initialized=false; fake_ready=false; settings_init(true); tick();
    fake_ready=true; tick(); assert(store_calls==5);
    initialized=false; fake_ready=false; settings_init(true); tick();
    assert(store_calls==5 && !fake_requested); // repeated reset at defaults is also a no-op
    const uint8_t eli[6]={0x5c,0xba,0x37,0x67,0x7f,0xda};
    settings_input(eli,0,0,fake_time++); settings_input(eli,0,4,fake_time++);
    assert(settings_active() && settings_controller(eli) && !settings_controller(blue));
    keys(0,2); assert(settings_active()); // other controller cannot cancel
    settings_disconnect(blue); assert(settings_active());
    settings_input(eli,0,0,fake_time++); settings_input(eli,0,4,fake_time++);
    tick(); assert(!settings_active() && store_calls==5); // Eli can save unchanged too
    // Load old-format settings without wearing flash merely to migrate them.
    settings_encode((motor_settings_t){20,350,80},350,fake_record);
    fake_record[0]=1; fake_record[4]=80;
    uint32_t crc=settings_crc(fake_record,6);
    for (unsigned i=0;i<4;i++) fake_record[6+i]=(uint8_t)(crc>>(8*i));
    initialized=false; fake_ready=false; settings_init(false); tick();
    assert(applied.range==80);
    keys(0,4); keys(0,4); tick(); assert(store_calls==5 && fake_record[0]==1);
    keys(0,4); keys(4,0); keys(4,0); keys(1,0); keys(0,4); tick();
    assert(applied.range==85 && fake_requested);
    fake_ready=true; tick(); assert(store_calls==6 && fake_record[0]==2);
    assert(settings_decode(fake_record,fake_size,350,&stored) && stored.range==85);
}

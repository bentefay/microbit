// Run the real audio adapter with a blocked-reader model of Zephyr's queue.
// The previous purge + while(get==0) implementation exits on the first request.
#include <assert.h>
#include <setjmp.h>
#include <stdarg.h>
#include <string.h>
#include "settings_audio.c"
static jmp_buf finished;
static bool blocked, cancelled;
static unsigned waits, starts, ends;
static bool audio_irq_enabled;
unsigned irq_lock(void) { assert(!"audio must not mask Bluetooth interrupts"); return 0; }
void irq_unlock(unsigned key) { (void)key; assert(0); }
void irq_enable(unsigned number) { assert(number==PWM1_IRQn); audio_irq_enabled=true; }
void irq_disable(unsigned number) { assert(number==PWM1_IRQn); audio_irq_enabled=false; }
int printk(const char *format,...) { (void)format; return 0; }
uint32_t k_uptime_get_32(void) { return 0; }
void k_msleep(int ms) { (void)ms; }
void k_msgq_purge(struct k_msgq *queue) {
    queue->occupied=false;
    if (blocked) cancelled=true; // pinned Zephyr wakes wait_q with -ENOMSG
}
int k_msgq_put(struct k_msgq *queue,const void *data,int timeout) {
    assert(timeout==K_NO_WAIT && queue->size<=sizeof(queue->data));
    if (queue->occupied) return -ENOMSG;
    memcpy(queue->data,data,queue->size); queue->occupied=true; return 0;
}
static void finish_playback(void) {
    assert(audio_irq_enabled);
    unsigned index=0;
    while (pwm.running) {
        assert(index<1000);
        pwm.handler(index++%2?NRFX_PWM_EVENT_END_SEQ1:NRFX_PWM_EVENT_END_SEQ0,NULL);
    }
    ends++;
}
int k_msgq_get(struct k_msgq *queue,void *data,int timeout) {
    if (timeout==K_FOREVER && !queue->occupied) {
        if (pwm.running) finish_playback();
        switch (++waits) {
        case 1:
            blocked=true; settings_audio(SET_ENTER,0); blocked=false;
            if (cancelled) { cancelled=false; return -ENOMSG; }
            break;
        case 2: return -ENOMSG; // even an interrupted wait must not kill audio
        case 3:
            settings_audio(SET_SELECT,0);
            settings_audio(SET_SELECT,1);
            settings_audio(SET_SELECT,2); // rapid navigation: newest wins
            break;
        default: longjmp(finished,1);
        }
    }
    if (!queue->occupied) return -ENOMSG;
    memcpy(data,queue->data,queue->size); queue->occupied=false; return 0;
}
int nrfx_pwm_init(nrfx_pwm_t *instance,const nrfx_pwm_config_t *config,
                  void (*handler)(nrfx_pwm_event_type_t,void *),void *context) {
    (void)context; assert(config->top_value==1000); instance->handler=handler; return 0;
}
bool nrfx_pwm_stop(nrfx_pwm_t *instance,bool wait) {
    assert(!wait); instance->running=false; instance->handler(NRFX_PWM_EVENT_STOPPED,NULL); return true;
}
bool nrfx_pwm_stopped_check(nrfx_pwm_t *instance) { return !instance->running; }
void nrfx_pwm_irq_handler(nrfx_pwm_t *instance) { (void)instance; }
uint32_t nrfx_pwm_complex_playback(nrfx_pwm_t *instance,const nrf_pwm_sequence_t *a,
                                  const nrf_pwm_sequence_t *b,uint16_t count,uint32_t flags) {
    assert(!instance->running && count==1 && (flags&NRFX_PWM_FLAG_LOOP));
    assert(!audio_irq_enabled); // only PWM is masked during buffer preparation
    assert(a->length==256 && b->length==256);
    if (starts==0) assert(total==2240+speech_length[0]);
    else assert(starts==1 && total==speech_length[2]);
    starts++; instance->running=true; return 0;
}
int main(void) {
    if (setjmp(finished)==0) audio_worker(NULL,NULL,NULL);
    assert(starts==2 && ends==2 && settings_audio_status()==0);
    assert(atomic_get(&audio_started)==2 && atomic_get(&audio_completed)==2);
    assert(!pwm.running);
}

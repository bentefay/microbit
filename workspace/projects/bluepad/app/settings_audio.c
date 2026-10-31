#include <zephyr/kernel.h>
#include <zephyr/irq.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/atomic.h>
#include <nrfx_pwm.h>
#include "settings_audio.h"
#include "audio_logic.h"
#include "speech_data.h"
BUILD_ASSERT(!IS_ENABLED(CONFIG_PWM), "PWM1 belongs exclusively to settings audio");

typedef struct { settings_event_t event; unsigned selected; } audio_request_t;
K_MSGQ_DEFINE(audio_queue, sizeof(audio_request_t), 1, 4);
static nrfx_pwm_t pwm = NRFX_PWM_INSTANCE(NRF_PWM1);
static uint16_t buffers[2][256]; // EasyDMA requires static RAM, never flash/stack
static nrf_pwm_sequence_t sequence[2];
static audio_request_t current;
static unsigned cursor, played, total, tone_samples;
static bool speech, playing;
static atomic_t audio_result=-EAGAIN;
static atomic_t audio_started, audio_completed;
int settings_audio_status(void) { return (int)atomic_get(&audio_result); }
void settings_audio_telemetry(uint32_t now) {
    printk("BP_AUDIO,%u,status,%d,16000\n",now,settings_audio_status());
    printk("BP_AUDIO_PLAY,%u,%ld,%ld\n",now,(long)atomic_get(&audio_started),(long)atomic_get(&audio_completed));
}
static uint16_t next_sample(void) {
    int value=0;
    if (cursor<tone_samples) value=audio_tone(current.event,cursor);
    else if (speech && cursor-tone_samples<speech_length[current.selected])
        value=(int)speech_data[current.selected][cursor-tone_samples]-128;
    cursor++;
    return (uint16_t)(500+value*3); // bounded duty, inverted P0.00 speaker
}
static void fill(unsigned index) {
    for (unsigned i=0;i<256;i++) buffers[index][i]=next_sample();
}
static void event_handler(nrfx_pwm_event_type_t event, void *context) {
    (void)context;
    if (event==NRFX_PWM_EVENT_STOPPED) { playing=false; return; }
    if (event!=NRFX_PWM_EVENT_END_SEQ0 && event!=NRFX_PWM_EVENT_END_SEQ1) return;
    if (!playing) return;
    played+=256;
    if (played>=total) { playing=false; atomic_inc(&audio_completed); nrfx_pwm_stop(&pwm,false); return; }
    fill(event==NRFX_PWM_EVENT_END_SEQ0?0:1);
}
static void pwm_interrupt(const void *arg) { (void)arg; nrfx_pwm_irq_handler(&pwm); }
void settings_audio(settings_event_t event, unsigned selected) {
    audio_request_t request={event,selected};
    // Never purge a queue with a blocked reader: Zephyr wakes that reader with
    // -ENOMSG. Replace only a queued obsolete request, not the waiting worker.
    if (k_msgq_put(&audio_queue,&request,K_NO_WAIT)!=0) {
        audio_request_t obsolete;
        k_msgq_get(&audio_queue,&obsolete,K_NO_WAIT);
        k_msgq_put(&audio_queue,&request,K_NO_WAIT);
    }
}
static void audio_worker(void *a, void *b, void *c) {
    (void)a; (void)b; (void)c;
    nrfx_pwm_config_t config=NRFX_PWM_DEFAULT_CONFIG(0,NRF_PWM_PIN_NOT_CONNECTED,NRF_PWM_PIN_NOT_CONNECTED,NRF_PWM_PIN_NOT_CONNECTED);
    config.base_clock=NRF_PWM_CLK_16MHz; config.top_value=1000;
    config.pin_inverted[0]=true; config.irq_priority=6;
    IRQ_CONNECT(PWM1_IRQn,6,pwm_interrupt,NULL,0);
    int rc=nrfx_pwm_init(&pwm,&config,event_handler,NULL);
    atomic_set(&audio_result,rc);
    printk("BP_AUDIO,%u,init,%d,16000\n",k_uptime_get_32(),rc);
    if (rc) return;
    irq_enable(PWM1_IRQn);
    for (unsigned i=0;i<2;i++) {
        sequence[i].values.p_common=buffers[i]; sequence[i].length=256;
    }
    audio_request_t request;
    for (;;) {
        if (k_msgq_get(&audio_queue,&request,K_FOREVER)!=0) continue;
        // Expected stop is one 62.5 us period. Bound even this low-priority
        // worker's wait so a peripheral fault cannot leave it spinning forever.
        if (!nrfx_pwm_stopped_check(&pwm)) nrfx_pwm_stop(&pwm,false);
        unsigned waited=0;
        while (!nrfx_pwm_stopped_check(&pwm) && waited++<10) k_msleep(1);
        if (!nrfx_pwm_stopped_check(&pwm)) { atomic_set(&audio_result,-ETIMEDOUT); continue; }
        atomic_set(&audio_result,0);
        unsigned key=irq_lock();
        current=request; cursor=played=0;
        speech=(current.event==SET_ENTER || current.event==SET_SELECT) && current.selected<3;
        tone_samples=audio_tone_ms(current.event)*16;
        total=tone_samples+(speech?speech_length[current.selected]:0);
        fill(0); fill(1);
        if (total) {
            playing=true;
            atomic_inc(&audio_started);
            nrfx_pwm_complex_playback(&pwm,&sequence[0],&sequence[1],1,
                NRFX_PWM_FLAG_LOOP|NRFX_PWM_FLAG_SIGNAL_END_SEQ0|NRFX_PWM_FLAG_SIGNAL_END_SEQ1|NRFX_PWM_FLAG_NO_EVT_FINISHED);
        }
        irq_unlock(key);
    }
}
K_THREAD_DEFINE(settings_audio_thread,1536,audio_worker,NULL,NULL,NULL,9,0,0);

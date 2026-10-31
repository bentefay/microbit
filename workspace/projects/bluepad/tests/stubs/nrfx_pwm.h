#ifndef TEST_NRFX_PWM_H
#define TEST_NRFX_PWM_H
#include <stdbool.h>
#include <stdint.h>
typedef enum { NRFX_PWM_EVENT_END_SEQ0, NRFX_PWM_EVENT_END_SEQ1, NRFX_PWM_EVENT_STOPPED } nrfx_pwm_event_type_t;
typedef struct { void *p_reg; bool running; void (*handler)(nrfx_pwm_event_type_t,void *); } nrfx_pwm_t;
typedef struct { int base_clock,top_value,irq_priority; bool pin_inverted[4]; } nrfx_pwm_config_t;
typedef struct { union { const uint16_t *p_common; } values; unsigned length; } nrf_pwm_sequence_t;
#define NRF_PWM1 ((void *)1)
#define PWM1_IRQn 1
#define NRFX_PWM_INSTANCE(reg) {.p_reg=reg}
#define NRFX_PWM_DEFAULT_CONFIG(...) {0}
#define NRF_PWM_CLK_16MHz 0
#define NRF_PWM_PIN_NOT_CONNECTED 0xffffffffu
#define NRFX_PWM_FLAG_LOOP 1
#define NRFX_PWM_FLAG_SIGNAL_END_SEQ0 2
#define NRFX_PWM_FLAG_SIGNAL_END_SEQ1 4
#define NRFX_PWM_FLAG_NO_EVT_FINISHED 8
int nrfx_pwm_init(nrfx_pwm_t *,const nrfx_pwm_config_t *,void (*)(nrfx_pwm_event_type_t,void *),void *);
bool nrfx_pwm_stop(nrfx_pwm_t *,bool);
bool nrfx_pwm_stopped_check(nrfx_pwm_t *);
void nrfx_pwm_irq_handler(nrfx_pwm_t *);
uint32_t nrfx_pwm_complex_playback(nrfx_pwm_t *,const nrf_pwm_sequence_t *,const nrf_pwm_sequence_t *,uint16_t,uint32_t);
#endif

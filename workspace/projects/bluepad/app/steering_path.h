#ifndef STEERING_PATH_H
#define STEERING_PATH_H
#include "motor_control.h"
// Raw 0x46 is the vendor's cumulative signed tenths-of-degree reading. Track
// actual travel, not commanded travel. 0x5d itself only accepts wrapped angles.
typedef struct {
    int32_t raw;
    int64_t position_tenths, waypoint, demand;
    uint32_t sampled;
    bool issued;
} steering_path_t;
static inline steering_path_t steering_begin(int32_t raw, int center, uint32_t now) {
    return (steering_path_t){.raw=raw,.position_tenths=(int64_t)center*10,.sampled=now};
}
static inline bool steering_sample(steering_path_t *s, int32_t raw, uint32_t now) {
    int64_t delta=(int64_t)raw-s->raw;
    // At 15% positioning speed a 90-degree jump between 50 ms samples is not
    // credible. Fail closed on encoder reset/wrap or an unexpected large move.
    if (delta < -900 || delta > 900) return false;
    s->position_tenths+=delta; s->raw=raw; s->sampled=now; return true;
}
static inline bool steering_fresh(const steering_path_t *s, uint32_t now) {
    return (uint32_t)(now-s->sampled)<=150;
}
static inline bool steering_next(steering_path_t *s, int64_t demand, bool force, int *angle) {
    int64_t remaining=s->waypoint*10-s->position_tenths;
    bool reached=remaining>=-50 && remaining<=50;
    if (!force && s->issued && s->demand==demand && (!reached || s->waypoint==demand)) return false;
    int64_t current=s->position_tenths/10;
    int64_t distance=demand-current;
    // Short waypoints leave ample margin below the ambiguous half-turn. Never
    // advance past one until measured feedback reaches it; a held stick cannot
    // accumulate turns. A reversal replans immediately from the measured angle.
    s->waypoint=current+(distance>60?60:distance< -60?-60:distance);
    s->demand=demand; s->issued=true;
    *angle=drive_angle((int)(s->waypoint%360));
    return true;
}
#endif

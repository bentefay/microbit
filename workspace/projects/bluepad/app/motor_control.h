#ifndef MOTOR_CONTROL_H
#define MOTOR_CONTROL_H
#include <stdbool.h>
#include <stdint.h>

// Loose shafts only: these are not measured chassis steering limits.
#define DRIVE_CAP 20
#define STEERING_TRAVEL 45
#define INPUT_TIMEOUT_MS 500u
typedef enum { DRIVE_INPUT, DRIVE_NEUTRAL, DRIVE_ACTIVE, DRIVE_STALE, DRIVE_ABORTED, DRIVE_FAULT } drive_mode_t;
typedef struct {
    bool present, abort;
    int owner, ly, rx;
    uint32_t received, epoch;
} drive_input_t;
typedef struct {
    drive_mode_t mode;
    bool armed, valid;
    int center, speed, target;
    uint32_t epoch;
} drive_control_t;
typedef struct { bool stop, speed, target; } drive_plan_t;
static inline int drive_abs(int v) { return v < 0 ? -v : v; }
static inline int drive_axis(int raw, int cap) {
    if (raw < -512) raw = -512;
    if (raw > 511) raw = 511;
    int magnitude = drive_abs(raw);
    if (magnitude <= 64) return 0;
    int range = raw < 0 ? 448 : 447;
    int mapped = ((magnitude - 64) * cap + range / 2) / range;
    return raw < 0 ? -mapped : mapped;
}
static inline int drive_angle(int angle) { return (angle % 360 + 360) % 360; }
static inline drive_plan_t drive_plan(drive_control_t *s, const drive_input_t *in, uint32_t now) {
    drive_plan_t plan = {0};
    if (s->mode == DRIVE_ABORTED || s->mode == DRIVE_FAULT) return plan;
    bool stale = (uint32_t)(now - in->received) > INPUT_TIMEOUT_MS;
    if (in->abort || !in->present || stale || in->epoch != s->epoch) {
        // Xbox can stop notifying at rest. A previously neutral owner may start
        // from its next fresh report; stale non-neutral demand must re-centre.
        bool idle_ready = s->armed && !in->abort && in->present && stale && in->epoch == s->epoch &&
                          drive_abs(in->ly) <= 64 && drive_abs(in->rx) <= 64;
        plan.stop = s->valid || in->abort;
        s->armed = idle_ready; s->valid = false; s->speed = 0;
        s->epoch = in->epoch;
        s->mode = in->abort ? DRIVE_ABORTED : !in->present ? DRIVE_INPUT : stale ? DRIVE_STALE : DRIVE_NEUTRAL;
        if (in->abort || !in->present || stale) return plan;
    }
    if (!s->armed && (drive_abs(in->ly) > 64 || drive_abs(in->rx) > 64)) {
        s->mode = DRIVE_NEUTRAL;
        return plan;
    }
    s->armed = true; s->mode = DRIVE_ACTIVE;
    int speed = -drive_axis(in->ly, DRIVE_CAP);
    int target = drive_angle(s->center + drive_axis(in->rx, STEERING_TRAVEL));
    plan.speed = !s->valid || speed != s->speed;
    plan.target = !s->valid || target != s->target;
    s->speed = speed; s->target = target; s->valid = true;
    return plan;
}
#endif

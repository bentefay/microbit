#ifndef START_GATE_H
#define START_GATE_H
#include <stdbool.h>
#include <stdint.h>

// Require a stable release, then a stable press. A held boot button cannot start.
typedef struct {
    uint32_t changed;
    unsigned raw;
    bool released;
    bool started;
} start_gate_t;

static inline unsigned start_gate_update(start_gate_t *gate, uint32_t now, unsigned buttons) {
    if (buttons != gate->raw) {
        gate->raw = buttons;
        gate->changed = now;
    }
    if ((uint32_t)(now - gate->changed) < 40) return 0;
    if (!buttons) gate->released = true;
    if (!buttons || !gate->released || gate->started) return 0;
    gate->started = true;
    return buttons;
}
#endif

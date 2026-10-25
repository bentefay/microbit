#ifndef DISPLAY_OWNER_H
#define DISPLAY_OWNER_H
#include <stdbool.h>
#include <stdint.h>
#include "controller_roles.h"

typedef struct {
    bool online, seen, supervisor, a_down;
    int32_t x, y, anchor_x, anchor_y;
} display_pad_t;
typedef struct { display_pad_t pad[2]; int owner; bool override_latched; } display_owner_t;
static inline int32_t display_clamp(int32_t v) { return v < -512 ? -512 : v > 511 ? 511 : v; }
static inline int display_abs(int v) { return v < 0 ? -v : v; }
static inline unsigned display_peers(const display_owner_t *s) {
    return (s->pad[0].online ? 1u : 0u) | (s->pad[1].online ? 2u : 0u);
}
static inline int display_supervisor_slot(const display_owner_t *s) {
    for (unsigned i = 0; i < 2; i++) if (s->pad[i].online && s->pad[i].supervisor) return (int)i;
    return -1;
}
static inline void display_select(display_owner_t *s) {
    if (s->override_latched) {
        int parent = display_supervisor_slot(s);
        s->owner = parent >= 0 && s->pad[parent].seen ? parent : -1;
        return; // Lost supervisor does not silently hand control to the child.
    }
    if (s->owner >= 0 && s->pad[s->owner].online && s->pad[s->owner].seen) return;
    s->owner = -1;
    for (unsigned i = 0; i < 2; i++) if (s->pad[i].online && s->pad[i].seen) {
        s->owner = (int)i;
        break;
    }
}
static inline void display_join(display_owner_t *s, unsigned slot, const uint8_t address[6]) {
    if (slot < 2) s->pad[slot] = (display_pad_t){.online = true, .supervisor = controller_is_supervisor(address)};
    display_select(s);
}
static inline void display_leave(display_owner_t *s, unsigned slot) {
    if (slot >= 2) return;
    s->pad[slot] = (display_pad_t){0};
    display_select(s);
}
// Shared mode preserves the original latest-meaningful-left-motion policy.
// Only a fresh A press from the known blue controller toggles override.
// True means redraw the selected output.
// This is diagnostic arbitration, not a motor-control loop.
static inline bool display_input(display_owner_t *s, unsigned slot, int32_t x, int32_t y,
                                 uint16_t buttons) {
    if (slot >= 2 || !s->pad[slot].online) return false;
    display_pad_t *p = &s->pad[slot];
    int old_owner = s->owner;
    x = display_clamp(x); y = display_clamp(y);
    bool deflected = display_abs(x) >= 96 || display_abs(y) >= 96;
    bool moved = !p->seen || display_abs(x - p->anchor_x) >= 64 || display_abs(y - p->anchor_y) >= 64;
    if (moved) { p->anchor_x = x; p->anchor_y = y; }
    bool a = (buttons & 1u) != 0; // Bluepad32 BUTTON_A, checked in platform.c.
    bool a_pressed = p->seen && a && !p->a_down;
    p->x = x; p->y = y; p->seen = true; p->a_down = a;
    if (p->supervisor && a_pressed) s->override_latched = !s->override_latched;
    if (!s->override_latched && (s->owner < 0 || (moved && deflected))) s->owner = (int)slot;
    display_select(s);
    return s->owner == (int)slot || s->owner != old_owner;
}
#endif

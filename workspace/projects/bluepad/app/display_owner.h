#ifndef DISPLAY_OWNER_H
#define DISPLAY_OWNER_H
#include <stdbool.h>
#include <stdint.h>

typedef struct { bool online, seen; int32_t x, y, anchor_x, anchor_y; } display_pad_t;
typedef struct { display_pad_t pad[2]; int owner; } display_owner_t;
static inline int32_t display_clamp(int32_t v) { return v < -512 ? -512 : v > 511 ? 511 : v; }
static inline int display_abs(int v) { return v < 0 ? -v : v; }
static inline unsigned display_peers(const display_owner_t *s) {
    return (s->pad[0].online ? 1u : 0u) | (s->pad[1].online ? 2u : 0u);
}
static inline void display_join(display_owner_t *s, unsigned slot) {
    if (slot < 2) s->pad[slot] = (display_pad_t){.online = true};
}
static inline void display_leave(display_owner_t *s, unsigned slot) {
    if (slot >= 2) return;
    s->pad[slot] = (display_pad_t){0};
    if (s->owner != (int)slot) return;
    s->owner = -1;
    for (unsigned i = 0; i < 2; i++)
        if (s->pad[i].online && s->pad[i].seen) { s->owner = (int)i; break; }
}
// Meaningful motion takes ownership; ordinary neutral jitter cannot steal it.
// The owner still renders every raw report, with no display dead zone/filter.
static inline bool display_input(display_owner_t *s, unsigned slot, int32_t x, int32_t y) {
    if (slot >= 2 || !s->pad[slot].online) return false;
    display_pad_t *p = &s->pad[slot];
    x = display_clamp(x); y = display_clamp(y);
    bool deflected = display_abs(x) >= 96 || display_abs(y) >= 96;
    bool moved = !p->seen || display_abs(x - p->anchor_x) >= 64 || display_abs(y - p->anchor_y) >= 64;
    if (moved) { p->anchor_x = x; p->anchor_y = y; }
    p->x = x; p->y = y; p->seen = true;
    if (s->owner < 0 || (moved && deflected)) s->owner = (int)slot;
    return s->owner == (int)slot;
}
#endif

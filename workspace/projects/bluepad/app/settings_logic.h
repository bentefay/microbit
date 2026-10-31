#ifndef SETTINGS_LOGIC_H
#define SETTINGS_LOGIC_H
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include "controller_roles.h"

typedef struct { int speed, center, range; } motor_settings_t;
typedef enum { SET_NONE, SET_ENTER, SET_SELECT, SET_UP, SET_DOWN, SET_LIMIT, SET_SAVE, SET_CANCEL } settings_event_t;
typedef struct {
    motor_settings_t live, saved;
    bool active, seen[2];
    unsigned selected;
    int editor;
    uint8_t held[2], blocked[2], repeat;
    uint32_t repeat_at;
} settings_ui_t;
// Internal masks deliberately match Bluepad32's D-pad; Menu/View occupy bits 4/5.
enum { SET_UP_KEY=1, SET_DOWN_KEY=2, SET_RIGHT_KEY=4, SET_LEFT_KEY=8, SET_MENU_KEY=16, SET_VIEW_KEY=32 };
static inline int settings_angle(int v) { return (v % 360 + 360) % 360; }
static inline motor_settings_t settings_defaults(int center) {
    return (motor_settings_t){20, settings_angle(center), 45};
}
static inline bool settings_valid(motor_settings_t s) {
    return s.speed >= 5 && s.speed <= 100 && s.speed % 5 == 0 && s.center >= 0 && s.center < 360 &&
           s.range >= 5 && s.range <= 80 && s.range % 5 == 0;
}
static inline bool settings_equal(motor_settings_t a, motor_settings_t b) {
    return a.speed == b.speed && a.center == b.center && a.range == b.range;
}
static inline settings_event_t settings_cancel(settings_ui_t *s) {
    bool active = s->active;
    s->active = false; s->repeat = 0; s->live = s->saved;
    return active ? SET_CANCEL : SET_NONE;
}
static inline settings_event_t settings_adjust(settings_ui_t *s, int direction) {
    int *v = s->selected == 0 ? &s->live.speed : s->selected == 1 ? &s->live.center : &s->live.range;
    int next = *v + direction * (s->selected == 1 ? 2 : 5);
    if (s->selected == 1) next = settings_angle(next);
    else if (next < 5 || next > (s->selected == 0 ? 100 : 80)) return SET_LIMIT;
    *v = next;
    return direction > 0 ? SET_UP : SET_DOWN;
}
static inline settings_event_t settings_keys(settings_ui_t *s, const uint8_t address[6], uint8_t keys, uint32_t now) {
    int pad=controller_settings_index(address);
    if (pad<0) return SET_NONE;
    if (!s->seen[pad]) { s->seen[pad] = true; s->held[pad] = s->blocked[pad] = keys; return SET_NONE; }
    s->blocked[pad] &= keys;
    uint8_t pressed = keys & ~s->held[pad] & ~s->blocked[pad];
    s->held[pad] = keys;
    if (s->active && s->editor!=pad) return SET_NONE;
    if ((keys & 3) != s->repeat) s->repeat = 0;
    if (pressed & SET_VIEW_KEY) return settings_cancel(s);
    if (pressed & SET_MENU_KEY) {
        s->repeat = 0;
        if (s->active) { s->active = false; s->saved = s->live; return SET_SAVE; }
        s->active = true; s->selected = 0; s->editor=pad; return SET_ENTER;
    }
    if (!s->active) return SET_NONE;
    if ((pressed & 12) && (keys & 12) != 12) {
        s->selected = (s->selected + ((pressed & SET_RIGHT_KEY) ? 1 : 2)) % 3;
        s->repeat = 0;
        return SET_SELECT;
    }
    if ((pressed & 3) && (keys & 3) != 3) {
        s->repeat = keys & 3; s->repeat_at = now + 400;
        return settings_adjust(s, s->repeat == SET_UP_KEY ? 1 : -1);
    }
    return SET_NONE;
}
static inline settings_event_t settings_leave(settings_ui_t *s, const uint8_t address[6]) {
    int pad=controller_settings_index(address);
    if (pad<0) return SET_NONE;
    s->seen[pad]=false; s->held[pad]=s->blocked[pad]=0;
    return s->active && s->editor==pad ? settings_cancel(s) : SET_NONE;
}
static inline settings_event_t settings_repeat(settings_ui_t *s, uint32_t now, bool fresh) {
    if (!fresh) s->repeat = 0;
    if (!s->active || !s->repeat || (int32_t)(now - s->repeat_at) < 0) return SET_NONE;
    s->repeat_at = now + 150; // no catch-up bursts after a stall
    return settings_adjust(s, s->repeat == SET_UP_KEY ? 1 : -1);
}

#define SETTINGS_TAG 0x4d425354u /* MBST */
#define SETTINGS_BYTES 10
static inline uint32_t settings_crc(const uint8_t *p, unsigned n) {
    uint32_t crc = 0xffffffffu;
    while (n--) { crc ^= *p++; for (unsigned i=0;i<8;i++) crc = (crc >> 1) ^ (0xedb88320u & (0u-(crc & 1))); }
    return ~crc;
}
// v1 stores centre as a modulo-360 offset from the boot reading until the
// encoder's absolute reference has been physically established. No C padding.
static inline void settings_encode(motor_settings_t s, int boot_center, uint8_t out[SETTINGS_BYTES]) {
    unsigned offset = settings_angle(s.center - boot_center);
    out[0]=1; out[1]=(uint8_t)s.speed; out[2]=(uint8_t)offset; out[3]=(uint8_t)(offset >> 8);
    out[4]=(uint8_t)s.range; out[5]=1; // explicit relative-reference flag
    uint32_t crc = settings_crc(out, 6);
    for (unsigned i=0;i<4;i++) out[6+i]=(uint8_t)(crc >> (8*i));
}
static inline bool settings_decode(const uint8_t *in, unsigned n, int boot_center, motor_settings_t *s) {
    if (n != SETTINGS_BYTES || in[0] != 1 || in[5] != 1) return false;
    uint32_t crc=0; for (unsigned i=0;i<4;i++) crc |= (uint32_t)in[6+i] << (8*i);
    int offset = in[2] | ((unsigned)in[3] << 8);
    motor_settings_t value = {in[1], offset, in[4]};
    if (crc != settings_crc(in,6) || !settings_valid(value)) return false;
    value.center = settings_angle(boot_center + offset); *s = value; return true;
}
#endif

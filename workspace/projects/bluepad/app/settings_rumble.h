#ifndef SETTINGS_RUMBLE_H
#define SETTINGS_RUMBLE_H
#include "settings_logic.h"
// Xbox BLE report 0x03 payload. Immutable for the entire deferred HIDS write.
// Durations are controller-enforced in 10 ms units; no delayed stop callback.
static inline const uint8_t *settings_rumble_report(settings_event_t event) {
    static const uint8_t packets[][8]={
        {3,0,0,0,0,0,0,0},
        {3,0,0,30,45,12,0,0}, // enter: medium 120 ms
        {3,0,0,0,20,3,0,0},   // select: light 30 ms
        {3,0,0,0,30,4,0,0},   // up/down: light 40 ms
        {3,0,0,0,30,4,0,0},
        {3,0,0,70,60,6,6,1},  // limit: strong double 60 ms
        {3,0,0,40,50,7,7,1},  // save: double 70 ms
        {3,0,0,40,15,25,0,0}  // cancel: long 250 ms
    };
    return packets[event>=SET_NONE && event<=SET_CANCEL?event:SET_NONE];
}
#endif

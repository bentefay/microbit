#ifndef AUDIO_LOGIC_H
#define AUDIO_LOGIC_H
#include "settings_logic.h"
static inline unsigned audio_tone_ms(settings_event_t event) {
    switch (event) {
    case SET_ENTER: return 140;
    case SET_UP: case SET_DOWN: return 40;
    case SET_LIMIT: return 180;
    case SET_SAVE: return 240;
    case SET_CANCEL: return 180;
    default: return 0;
    }
}
static inline int audio_tone(settings_event_t event, unsigned sample) {
    unsigned ms=sample/16, duration=audio_tone_ms(event), frequency=0;
    if (ms>=duration) return 0;
    switch (event) {
    case SET_ENTER: frequency=600+ms*6; break;
    case SET_UP: frequency=1000+ms*20; break;
    case SET_DOWN: frequency=1800-ms*20; break;
    case SET_LIMIT: frequency=(ms<60 || ms>=120)?180:0; break;
    case SET_SAVE: frequency=ms<90?800:ms>=150?1200:0; break;
    case SET_CANCEL: frequency=1200-ms*5; break;
    default: break;
    }
    if (!frequency) return 0;
    int amplitude=55;
    if (ms<5) amplitude=amplitude*(int)ms/5;
    if (duration-ms<5) amplitude=amplitude*(int)(duration-ms)/5;
    return ((sample*frequency/8000)&1)?amplitude:-amplitude;
}
#endif

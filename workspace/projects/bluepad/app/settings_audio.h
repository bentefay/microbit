#ifndef SETTINGS_AUDIO_H
#define SETTINGS_AUDIO_H
#include "settings_logic.h"
void settings_audio(settings_event_t event, unsigned selected);
int settings_audio_status(void);
void settings_audio_telemetry(uint32_t now);
#endif

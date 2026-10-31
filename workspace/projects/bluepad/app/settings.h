#ifndef SETTINGS_H
#define SETTINGS_H
#include "settings_logic.h"
void settings_init(bool factory_reset);
void settings_input(const uint8_t address[6], uint8_t dpad, uint8_t misc, uint32_t now);
void settings_disconnect(const uint8_t address[6]);
void settings_tick(uint32_t now, bool blue_fresh);
bool settings_active(void);
settings_event_t settings_rumble_pending(uint32_t now);
void settings_rumble_sent(void);
#endif

#ifndef MOTOR_DRIVE_H
#define MOTOR_DRIVE_H
#include "motor_control.h"
#include "settings_logic.h"
void motor_drive_start(void);
void motor_drive_abort(void);
void motor_drive_input(drive_input_t input);
bool motor_drive_boot(int *center, int32_t *raw);
void motor_drive_settings(motor_settings_t settings);
void motor_drive_save_request(bool requested);
bool motor_drive_save_ready(void);
#endif

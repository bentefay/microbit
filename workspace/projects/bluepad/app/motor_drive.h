#ifndef MOTOR_DRIVE_H
#define MOTOR_DRIVE_H
#include "motor_control.h"
void motor_drive_start(void);
void motor_drive_abort(void);
void motor_drive_input(drive_input_t input);
#endif

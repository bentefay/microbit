#ifndef JOYSTICK_MATRIX_H
#define JOYSTICK_MATRIX_H
#include <stdbool.h>
#include <stdint.h>
bool joystick_matrix_init(void);
void joystick_matrix_update(int32_t x, int32_t y);
void joystick_matrix_clear(void);
#endif

#ifndef NEZHA_ADAPTER_H
#define NEZHA_ADAPTER_H
#include <stdint.h>
// Optional compile-only adapter. Nothing in this application calls it.
// This is a low-level primitive, NOT a safe robot-driving controller.
int nezha_write_motor(uint8_t port, int speed);
#endif

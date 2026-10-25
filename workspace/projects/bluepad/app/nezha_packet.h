#ifndef NEZHA_PACKET_H
#define NEZHA_PACKET_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
// Nezha v2 0x10 command encoding. This function only constructs bytes.
static inline bool nezha_motor_packet(uint8_t port, int speed, uint8_t out[8]) {
    if (out == NULL || port < 1 || port > 4) return false;
    if (speed > 100) speed = 100;
    if (speed < -100) speed = -100;
    out[0] = 0xff; out[1] = 0xf9; out[2] = port;
    out[3] = speed == 0 ? 0 : speed > 0 ? 1 : 2;
    out[4] = speed == 0 ? 0x5f : 0x60;
    out[5] = (uint8_t)(speed < 0 ? -speed : speed);
    out[6] = 0xf5; out[7] = 0;
    return true;
}
#endif

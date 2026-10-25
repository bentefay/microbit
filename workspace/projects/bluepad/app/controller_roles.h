#ifndef CONTROLLER_ROLES_H
#define CONTROLLER_ROLES_H
#include <stdbool.h>
#include <stdint.h>

// The second controller paired during commissioning: the parent's blue Xbox.
// Public BLE address verified from its discovery, bond and HID connection logs.
static inline bool controller_is_supervisor(const uint8_t address[6]) {
    static const uint8_t blue[6] = {0x5c, 0xba, 0x37, 0xdd, 0xd9, 0x6c};
    for (unsigned i = 0; i < 6; i++) if (address[i] != blue[i]) return false;
    return true;
}
#endif

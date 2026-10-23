#include "pxt.h"

// Preserve CODAL's status instead of treating an unsuccessful read as a byte.
// Deliberately uses the existing bus configuration and STOP semantics.
// This does NOT shorten CODAL's native timeout or prove radio freshness.
namespace ps2Transport {
    static int lastStatus = 0;

    //%
    int read() {
#if MICROBIT_CODAL
        uint8_t value = 0;
#else
        char value = 0;
#endif
        lastStatus = uBit.i2c.read(0x08 << 1, &value, 1, false);
        return lastStatus == 0 ? (uint8_t)value : -2;
    }

    //%
    int write(int command) {
#if MICROBIT_CODAL
        uint8_t value = command;
#else
        char value = command;
#endif
        lastStatus = uBit.i2c.write(0x08 << 1, &value, 1, false);
        return lastStatus;
    }

    //%
    int status() { return lastStatus; }
}

#include <assert.h>
#include <string.h>
#include "controller_roles.h"
int main(void) {
    const uint8_t blue[6] = {0x5c, 0xba, 0x37, 0xdd, 0xd9, 0x6c};
    const uint8_t eli[6] = {0x5c, 0xba, 0x37, 0x67, 0x7f, 0xda};
    assert(controller_is_supervisor(blue));
    assert(!controller_is_supervisor(eli));
    for (unsigned i = 0; i < 6; i++) {
        uint8_t other[6]; memcpy(other, blue, sizeof(other)); other[i] ^= 1;
        assert(!controller_is_supervisor(other));
    }
}

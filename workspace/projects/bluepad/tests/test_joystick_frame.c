#include <assert.h>
#include <limits.h>
#include "joystick_frame.h"
static void only_pixel(int32_t x, int32_t y, unsigned expected) {
    uint8_t frame[25]; joystick_frame(x, y, frame);
    for (unsigned i = 0; i < 25; i++) assert(frame[i] == (i == expected ? 255 : 0));
}
int main(void) {
    only_pixel(0, 0, 12);
    only_pixel(-512, -512, 0); only_pixel(511, -512, 4);
    only_pixel(-512, 511, 20); only_pixel(511, 511, 24);
    only_pixel(INT_MIN, INT_MAX, 20);
    only_pixel(0, -512, 2); only_pixel(511, 0, 14);
    uint8_t frame[25]; joystick_frame(128, 0, frame);
    assert(frame[12] == 128 && frame[13] == 128);
    for (int y = -512; y <= 511; y += 7) for (int x = -512; x <= 511; x += 7) {
        joystick_frame(x, y, frame);
        unsigned lit = 0, total = 0;
        for (unsigned i = 0; i < 25; i++) { lit += frame[i] != 0; total += frame[i]; }
        assert(lit >= 1 && lit <= 4);
        assert(total >= 253 && total <= 257);
    }
}

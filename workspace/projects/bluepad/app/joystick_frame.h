#ifndef JOYSTICK_FRAME_H
#define JOYSTICK_FRAME_H
#include <stdint.h>

// Bluepad Xbox axes: -512..511, with negative Y pointing up. Q8 pixel coordinates.
static inline int joystick_coordinate(int32_t value) {
    if (value < -512) value = -512;
    if (value > 511) value = 511;
    return 512 + (value < 0 ? value : (value * 512 + 255) / 511);
}
static inline void joystick_frame(int32_t x, int32_t y, uint8_t pixels[25]) {
    int px = joystick_coordinate(x), py = joystick_coordinate(y);
    for (int row = 0; row < 5; row++) {
        for (int col = 0; col < 5; col++) {
            int dx = col * 256 - px, dy = row * 256 - py;
            if (dx < 0) dx = -dx;
            if (dy < 0) dy = -dy;
            int wx = dx < 256 ? 256 - dx : 0;
            int wy = dy < 256 ? 256 - dy : 0;
            pixels[row * 5 + col] = (uint8_t)((wx * wy * 255 + 32768) / 65536);
        }
    }
}
#endif

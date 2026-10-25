#include <string.h>
#include <zephyr/drivers/display.h>
#include "joystick_frame.h"
#include "joystick_matrix.h"

// The pinned Nordic driver exposes 25 row-major 8-bit brightness values through
// get_framebuffer(), although its display_write() API only accepts monochrome.
// Keep this driver-specific dependency explicit; do not use it with other drivers.
BUILD_ASSERT(DT_NODE_HAS_COMPAT(DT_CHOSEN(zephyr_display), nordic_nrf_led_matrix));
BUILD_ASSERT(DT_PROP(DT_CHOSEN(zephyr_display), width) == 5);
BUILD_ASSERT(DT_PROP(DT_CHOSEN(zephyr_display), height) == 5);
static uint8_t *framebuffer;

bool joystick_matrix_init(void) {
    const struct device *display = DEVICE_DT_GET(DT_CHOSEN(zephyr_display));
    if (!device_is_ready(display)) return false;
    framebuffer = display_get_framebuffer(display);
    if (!framebuffer) return false;
    joystick_matrix_clear();
    if (display_blanking_off(display) != 0) { framebuffer = NULL; return false; }
    return true;
}
void joystick_matrix_clear(void) {
    if (framebuffer) memset(framebuffer, 0, 25);
}
void joystick_matrix_update(int32_t x, int32_t y) {
    if (!framebuffer) return;
    uint8_t frame[25];
    joystick_frame(x, y, frame);
    // No sleeps, allocation, animation queue, smoothing or interrupt masking.
    // The hardware scan can straddle this brief copy; updates are not frame-atomic.
    memcpy(framebuffer, frame, sizeof(frame));
}

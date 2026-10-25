// Experimental report-only micro:bit port. No motor or servo output exists here.
#include <uni.h>
#include <bt/uni_bt_service.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>
#include "start_gate.h"

static const struct gpio_dt_spec buttons[] = {
    GPIO_DT_SPEC_GET(DT_ALIAS(sw0), gpios),
    GPIO_DT_SPEC_GET(DT_ALIAS(sw1), gpios),
};
static btstack_timer_source_t timer;
static start_gate_t gate;
static bool bluetooth_ready, buttons_ready, device_ready;
static uint32_t reports, last_heartbeat, last_printed;
static unsigned start_button;
static const char *state(void) {
    if (!buttons_ready) return "button-error";
    if (!bluetooth_ready) return "initializing";
    if (!gate.started) return "waiting";
    return device_ready ? "connected" : "scanning";
}
static void tick(btstack_timer_source_t *source) {
    uint32_t now = btstack_run_loop_get_time_ms();
    if (buttons_ready && bluetooth_ready && !gate.started) {
        int a = gpio_pin_get_dt(&buttons[0]);
        int b = gpio_pin_get_dt(&buttons[1]);
        if (a < 0 || b < 0) buttons_ready = false;
        else if ((start_button = start_gate_update(&gate, now, (a ? 1 : 0) | (b ? 2 : 0)))) {
            printk("BP_START,%u,%u\n", now, start_button);
            uni_bt_start_scanning_and_autoconnect_unsafe();
        }
    }
    if ((uint32_t)(now - last_heartbeat) >= 1000) {
        last_heartbeat = now;
        printk("BP_STATUS,1,%u,%s,%u,%u\n", now, state(), start_button, reports);
    }
    btstack_run_loop_set_timer(source, 20);
    btstack_run_loop_add_timer(source);
}
static void platform_init(int argc, const char **argv) {
    (void)argc; (void)argv;
    uni_bt_service_set_enabled(false);
    buttons_ready = true;
    for (unsigned i = 0; i < 2; i++) {
        if (!gpio_is_ready_dt(&buttons[i]) || gpio_pin_configure_dt(&buttons[i], GPIO_INPUT) < 0)
            buttons_ready = false;
    }
    btstack_run_loop_set_timer_handler(&timer, tick);
    btstack_run_loop_set_timer(&timer, 20);
    btstack_run_loop_add_timer(&timer);
}
static void platform_ready(void) {
    bluetooth_ready = true;
    // Reset debounce here so a button held during Bluetooth startup is ignored.
    gate = (start_gate_t){.changed = btstack_run_loop_get_time_ms()};
    printk("BP_WAIT,1\n");
}
static void connected(uni_hid_device_t *d) { logi("Connected: %p\n", d); }
static void disconnected(uni_hid_device_t *d) {
    device_ready = false;
    printk("BP_DISCONNECTED,%u\n", btstack_run_loop_get_time_ms());
}
static uni_error_t ready(uni_hid_device_t *d) {
    device_ready = true;
    printk("BP_CONNECTED,%u\n", btstack_run_loop_get_time_ms());
    return UNI_ERROR_SUCCESS;
}
static void data(uni_hid_device_t *d, uni_controller_t *ctl) {
    (void)d;
    // Parse every incoming report, but print at most 10 snapshots/second.
    // Unbuffered 115200-baud logging must not monopolize the HCI run-loop thread.
    if (ctl->klass != UNI_CONTROLLER_CLASS_GAMEPAD) return;
    reports++;
    uint32_t now = btstack_run_loop_get_time_ms();
    if (reports > 1 && (uint32_t)(now - last_printed) < 100) return;
    last_printed = now;
    const uni_gamepad_t *g = &ctl->gamepad;
    printk("BP_INPUT,%u,%u,%d,%d,%d,%d,%d,%d,%u,%u,%u\n", now, reports,
           g->axis_x, g->axis_y, g->axis_rx, g->axis_ry, g->brake, g->throttle,
           g->buttons, g->dpad, g->misc_buttons);
}
static void oob(uni_platform_oob_event_t event, void *context) {
    (void)context; logi("Platform event: %d\n", event);
}
static struct uni_platform platform = {
    .name = "microbit-v2-report-only",
    .init = platform_init,
    .on_init_complete = platform_ready,
    .on_device_connected = connected,
    .on_device_disconnected = disconnected,
    .on_device_ready = ready,
    .on_controller_data = data,
    .on_oob_event = oob,
};
int btstack_main(void) {
    uni_platform_set_custom(&platform);
    return uni_init(0, NULL);
}

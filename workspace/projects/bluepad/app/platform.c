// Default: report-only. Explicit motor-bench build adds a finite front-button sequence.
#include <uni.h>
#include <bt/uni_bt_service.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>
#include "start_gate.h"
#include "joystick_matrix.h"
#include "display_owner.h"
#ifdef ENABLE_MOTOR_BENCH
#include "motor_bench.h"
#endif
#ifdef ENABLE_MOTOR_DRIVE
#include "motor_drive.h"
#include <zephyr/kernel.h>
#include <ble/gatt-service/hids_host.h>
static uint32_t received[2], motor_epoch, polled[2], polls[2];
static uint8_t poll_status[2];
#endif

BUILD_ASSERT(BUTTON_A == 1u, "Override toggle must match Bluepad32's A button");

static const struct gpio_dt_spec buttons[] = {
    GPIO_DT_SPEC_GET(DT_ALIAS(sw0), gpios),
    GPIO_DT_SPEC_GET(DT_ALIAS(sw1), gpios),
};
static btstack_timer_source_t timer;
static start_gate_t gate;
static bool bluetooth_ready, buttons_ready;
static uint32_t reports, last_heartbeat, last_printed[2], pad_reports[2], both_updates[2];
static display_owner_t display_state = {.owner = -1};
static unsigned start_button;
static bool matrix_ready;
static uint32_t matrix_updates;
#ifdef ENABLE_MOTOR_DRIVE
static void publish_motor_input(void) {
    int owner = display_state.owner;
    drive_input_t input = {.owner = owner, .epoch = motor_epoch};
    if (owner >= 0) {
        const display_pad_t *p = &display_state.pad[owner];
        input.present = p->online && p->seen;
        input.ly = p->y; input.rx = p->rx; input.received = received[owner];
    }
    motor_drive_input(input);
}
#endif
static const char *state(void) {
    if (!buttons_ready) return "button-error";
    if (!bluetooth_ready) return "initializing";
    if (!gate.started) return "waiting";
    return display_peers(&display_state) ? "connected" : "scanning";
}
static void peers(void) {
    printk("BP_PEERS,%u,%u,%d\n", btstack_run_loop_get_time_ms(),
           display_peers(&display_state), display_state.owner);
}
static void priority(void) {
    peers();
    printk("BP_PRIORITY,%u,%u,%d\n", btstack_run_loop_get_time_ms(), display_state.override_latched,
           display_supervisor_slot(&display_state));
}
static void draw_owner(void) {
    if (!matrix_ready) return;
    if (display_state.owner < 0) joystick_matrix_clear();
    else {
        const display_pad_t *p = &display_state.pad[display_state.owner];
        joystick_matrix_update(p->x, p->y);
        matrix_updates++;
        if (display_peers(&display_state) == 3) both_updates[display_state.owner]++;
    }
}
static void tick(btstack_timer_source_t *source) {
    uint32_t now = btstack_run_loop_get_time_ms();
#ifdef ENABLE_MOTOR_BENCH
    if (buttons_ready && gate.started && gpio_pin_get_dt(&buttons[0]) > 0 &&
        gpio_pin_get_dt(&buttons[1]) > 0) motor_bench_abort();
#endif
#ifdef ENABLE_MOTOR_DRIVE
    if (buttons_ready && gate.started && gpio_pin_get_dt(&buttons[0]) > 0 &&
        gpio_pin_get_dt(&buttons[1]) > 0) motor_drive_abort();
    int owner = display_state.owner;
    uint32_t current = k_uptime_get_32();
    if (gate.started && owner >= 0 && (uint32_t)(current - received[owner]) >= 150 &&
        (uint32_t)(current - polled[owner]) >= 150) {
        uni_hid_device_t *d = uni_hid_device_get_instance_for_idx(owner);
        polled[owner] = current; polls[owner]++;
        // Xbox BLE gamepad input is report 1. BTstack delivers successful reads
        // through the usual HID callback; only that response updates freshness.
        poll_status[owner] = hids_host_send_get_report(d->hids_cid, 1, HID_REPORT_TYPE_INPUT);
    }
#endif
    if (buttons_ready && bluetooth_ready && !gate.started) {
        int a = gpio_pin_get_dt(&buttons[0]);
        int b = gpio_pin_get_dt(&buttons[1]);
        if (a < 0 || b < 0) buttons_ready = false;
        else if ((start_button = start_gate_update(&gate, now, (a ? 1 : 0) | (b ? 2 : 0)))) {
            printk("BP_START,%u,%u\n", now, start_button);
            uni_bt_start_scanning_and_autoconnect_unsafe();
#ifdef ENABLE_MOTOR_BENCH
            if (start_button == 3) motor_bench_abort();
            motor_bench_start();
#endif
#ifdef ENABLE_MOTOR_DRIVE
            if (start_button == 3) motor_drive_abort();
            motor_drive_start();
#endif
        }
    }
    if ((uint32_t)(now - last_heartbeat) >= 1000) {
        last_heartbeat = now;
        printk("BP_STATUS,1,%u,%s,%u,%u\n", now, state(), start_button, reports);
        printk("BP_DISPLAY,%u,%u,%u\n", now, matrix_ready, matrix_updates);
        priority();
#ifdef ENABLE_MOTOR_BENCH
        motor_bench_status();
#endif
        for (int i = 0; i < 2; i++) if (display_state.pad[i].online) {
            uni_hid_device_t *d = uni_hid_device_get_instance_for_idx(i);
            printk("BP_SLOT,%u,%d,%s,%u,%u\n", now, i, bd_addr_to_str(d->conn.btaddr), pad_reports[i], both_updates[i]);
#ifdef ENABLE_MOTOR_DRIVE
            printk("BP_POLL,%u,%d,%u,%u\n", now, i, polls[i], poll_status[i]);
#endif
        }
    }
    btstack_run_loop_set_timer(source, 20);
    btstack_run_loop_add_timer(source);
}
static void platform_init(int argc, const char **argv) {
    (void)argc; (void)argv;
    uni_bt_service_set_enabled(false);
    matrix_ready = joystick_matrix_init();
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
static uni_error_t discovered(bd_addr_t addr, const char *name, uint16_t cod, uint8_t rssi) {
    (void)addr; (void)name; (void)cod; (void)rssi;
    if (!gate.started || display_peers(&display_state) == 3) return UNI_ERROR_IGNORE_DEVICE;
    // Device Information Service queries use a singleton upstream. Serialize
    // setup, including already-queued advertisements, while retaining ready links.
    const bd_addr_t empty = {0};
    for (int i = 0; i < 2; i++) {
        uni_hid_device_t *d = uni_hid_device_get_instance_for_idx(i);
        if (bd_addr_cmp(d->conn.btaddr, empty) && d->conn.state != UNI_BT_CONN_STATE_DEVICE_READY)
            return UNI_ERROR_IGNORE_DEVICE;
    }
    return UNI_ERROR_SUCCESS;
}
static void disconnected(uni_hid_device_t *d) {
    int slot = uni_hid_device_get_idx_for_instance(d);
    if (slot < 0 || slot >= 2) return;
    int old_owner = display_state.owner;
    display_leave(&display_state, slot);
#ifdef ENABLE_MOTOR_DRIVE
    if (old_owner == slot) motor_epoch++;
    received[slot] = 0;
    publish_motor_input();
#endif
    if (old_owner != display_state.owner) draw_owner();
    printk("BP_GONE,%u,%d\n", btstack_run_loop_get_time_ms(), slot);
    peers();
}
static uni_error_t ready(uni_hid_device_t *d) {
    int slot = uni_hid_device_get_idx_for_instance(d);
    if (slot < 0 || slot >= 2) return UNI_ERROR_INVALID_DEVICE;
    display_join(&display_state, slot, d->conn.btaddr);
#ifdef ENABLE_MOTOR_DRIVE
    received[slot] = 0;
    polled[slot] = 0; polls[slot] = 0; poll_status[slot] = 0;
    publish_motor_input();
#endif
    pad_reports[slot] = 0; last_printed[slot] = 0; both_updates[slot] = 0;
    printk("BP_READY,%u,%d,%s\n", btstack_run_loop_get_time_ms(), slot, bd_addr_to_str(d->conn.btaddr));
    peers();
    return UNI_ERROR_SUCCESS;
}
static void data(uni_hid_device_t *d, uni_controller_t *ctl) {
    int slot = uni_hid_device_get_idx_for_instance(d);
    if (slot < 0 || slot >= 2 || !display_state.pad[slot].online) return;
    // Parse every report; print at most five snapshots/second per controller.
    // Unbuffered 115200-baud logging must not monopolize the HCI run-loop thread.
    if (ctl->klass != UNI_CONTROLLER_CLASS_GAMEPAD) return;
    reports++;
    pad_reports[slot]++;
    const uni_gamepad_t *g = &ctl->gamepad;
    // Display every received report BEFORE the serial snapshot rate limit.
    bool was_override = display_state.override_latched;
#ifdef ENABLE_MOTOR_DRIVE
    received[slot] = k_uptime_get_32();
    if (display_input_axes(&display_state, slot, g->axis_x, g->axis_y,
                           g->axis_rx, g->axis_ry, g->buttons)) draw_owner();
    publish_motor_input();
#else
    if (display_input(&display_state, slot, g->axis_x, g->axis_y, g->buttons)) draw_owner();
#endif
    if (was_override != display_state.override_latched) priority();
    uint32_t now = btstack_run_loop_get_time_ms();
    if (pad_reports[slot] > 1 && (uint32_t)(now - last_printed[slot]) < 200) return;
    last_printed[slot] = now;
    printk("BP_PAD,%u,%d,%u,%d,%d,%d,%d,%d,%d,%u,%u,%u\n", now, slot, pad_reports[slot],
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
    .on_device_discovered = discovered,
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

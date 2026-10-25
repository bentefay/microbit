// Experimental report-only micro:bit port. No motor or servo output exists here.
#include <uni.h>
#include <bt/uni_bt_service.h>
static void platform_init(int argc, const char **argv) {
    (void)argc; (void)argv;
    uni_bt_service_set_enabled(false);
}
static void platform_ready(void) {
    logi("microbit: report-only BLE scan ready; motors not implemented\n");
    uni_bt_start_scanning_and_autoconnect_unsafe();
}
static void connected(uni_hid_device_t *d) { logi("Connected: %p\n", d); }
static void disconnected(uni_hid_device_t *d) { logi("Disconnected: %p\n", d); }
static uni_error_t ready(uni_hid_device_t *d) {
    logi("Device ready: %p\n", d); return UNI_ERROR_SUCCESS;
}
static void data(uni_hid_device_t *d, uni_controller_t *ctl) {
    (void)d;
    // Parse every incoming report, but print at most 10 snapshots/second.
    // Unbuffered 115200-baud logging must not monopolize the HCI run-loop thread.
    static uint32_t last_printed;
    static bool printed;
    if (ctl->klass != UNI_CONTROLLER_CLASS_GAMEPAD) return;
    uint32_t now = btstack_run_loop_get_time_ms();
    if (printed && (uint32_t)(now - last_printed) < 100) return;
    last_printed = now;
    printed = true;
    uni_gamepad_dump(&ctl->gamepad);
    logi("\n");
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

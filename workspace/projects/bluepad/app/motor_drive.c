#include <zephyr/kernel.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>
#include <string.h>
#include "motor_drive.h"
#include "nezha_packet.h"

static const struct device *const bus = DEVICE_DT_GET(DT_NODELABEL(i2c1));
K_SEM_DEFINE(begin_drive, 0, 1);
static atomic_t started, aborted;
static struct k_spinlock input_lock;
static drive_input_t pending = {.owner = -1};
static unsigned writes, max_io_ms;
static int error;
static const char *const mode_names[] = {"input", "neutral", "active", "stale", "aborted", "fault"};
void motor_drive_input(drive_input_t input) {
    k_spinlock_key_t key = k_spin_lock(&input_lock);
    pending = input;
    k_spin_unlock(&input_lock, key);
}
void motor_drive_start(void) { if (atomic_cas(&started, 0, 1)) k_sem_give(&begin_drive); }
void motor_drive_abort(void) { atomic_set(&aborted, 1); }
static drive_input_t latest(void) {
    k_spinlock_key_t key = k_spin_lock(&input_lock);
    drive_input_t input = pending;
    k_spin_unlock(&input_lock, key);
    input.abort = atomic_get(&aborted) != 0;
    return input;
}
static int write_packet(const uint8_t packet[8]) {
    if (!device_is_ready(bus)) return -ENODEV;
    uint32_t began = k_uptime_get_32();
    int rc = i2c_write(bus, packet, 8, 0x10);
    unsigned elapsed = k_uptime_get_32() - began;
    if (elapsed > max_io_ms) max_io_ms = elapsed;
    writes++;
    return rc;
}
static int speed(unsigned port, int demand) {
    uint8_t packet[8];
    if (!nezha_motor_packet(port, demand, packet)) return -EINVAL;
    return write_packet(packet);
}
static int stop_both(void) {
    int a = speed(1, 0), b = speed(2, 0);
    return a ? a : b;
}
static int initialize(int *center) {
    int rc = stop_both();
    if (rc) return rc;
    // Encoder is signed little-endian tenths of a degree. Only this worker owns
    // the bus, so the request/read pair cannot interleave with another command.
    const uint8_t request[8] = {0xff,0xf9,2,0,0x46,0,0xf5,0};
    k_msleep(4);
    rc = write_packet(request);
    if (rc) return rc;
    k_msleep(4);
    uint8_t bytes[4];
    rc = i2c_read(bus, bytes, 4, 0x10);
    if (rc) return rc;
    uint32_t bits = (uint32_t)bytes[0] | ((uint32_t)bytes[1] << 8) |
                    ((uint32_t)bytes[2] << 16) | ((uint32_t)bytes[3] << 24);
    int32_t tenths; memcpy(&tenths, &bits, sizeof(tenths));
    *center = drive_angle((tenths % 3600) / 10);
    const uint8_t servo_speed[8] = {0xff,0xf9,0,0,0x77,0,0,135};
    return write_packet(servo_speed);
}
static int position(int target) {
    const uint8_t packet[8] = {0xff,0xf9,2,0,0x5d,(uint8_t)(target >> 8),1,(uint8_t)target};
    int rc = write_packet(packet);
    k_msleep(4); // Required bus settling; no 500 ms API wait and no motion wait.
    return rc;
}
static void worker(void *a, void *b, void *c) {
    (void)a; (void)b; (void)c;
    // Readiness heartbeat without motor writes; front A/B starts exactly once.
    while (k_sem_take(&begin_drive, K_SECONDS(1)) != 0)
        printk("BP_DRIVE,%u,waiting,-1,0,-1,-1,0,0,0,0\n", k_uptime_get_32());
    drive_control_t control = {0};
    error = initialize(&control.center);
    if (error) { control.mode = DRIVE_FAULT; stop_both(); }
    uint32_t printed = 0;
    drive_mode_t last_mode = DRIVE_FAULT;
    for (;;) {
        drive_input_t input = latest();
        drive_plan_t plan = drive_plan(&control, &input, k_uptime_get_32());
        int rc = 0;
        if (plan.stop) rc = stop_both();
        // Continuous drive first. Cached demands suppress repeated I2C writes.
        if (!rc && plan.speed) rc = speed(1, control.speed);
        if (!rc && plan.target) rc = position(control.target);
        if (rc) {
            error = rc; control.mode = DRIVE_FAULT; control.armed = false;
            control.speed = 0; stop_both();
        }
        uint32_t now = k_uptime_get_32();
        if (control.mode != last_mode || (uint32_t)(now - printed) >= 200) {
            printk("BP_DRIVE,%u,%s,%d,%d,%d,%d,%u,%d,%u,%u\n", now, mode_names[control.mode],
                   input.owner, control.speed, control.valid ? control.target : -1, control.center,
                   writes, error, input.present ? now - input.received : 0, max_io_ms);
            printed = now; last_mode = control.mode;
        }
        k_msleep(10);
    }
}
K_THREAD_DEFINE(motor_drive_thread, 2048, worker, NULL, NULL, NULL, 7, 0, 0);

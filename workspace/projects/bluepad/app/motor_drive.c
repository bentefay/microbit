#include <zephyr/kernel.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>
#include <string.h>
#include "motor_drive.h"
#include "nezha_packet.h"
#include "steering_path.h"

static const struct device *const bus = DEVICE_DT_GET(DT_NODELABEL(i2c1));
K_SEM_DEFINE(begin_drive, 0, 1);
static atomic_t started, aborted;
static atomic_t boot_ready, settings_ready, save_requested, save_ready;
static int boot_center;
static int32_t boot_raw;
static motor_settings_t runtime_settings;
static struct k_spinlock input_lock;
static drive_input_t pending = {.owner = -1};
static unsigned writes, max_io_ms;
static int error;
bool motor_drive_boot(int *center, int32_t *raw) {
    if (!atomic_get(&boot_ready)) return false;
    *center = boot_center; *raw = boot_raw; return true;
}
void motor_drive_settings(motor_settings_t settings) {
    if (!settings_valid(settings)) return;
    k_spinlock_key_t key = k_spin_lock(&input_lock);
    runtime_settings = settings;
    k_spin_unlock(&input_lock, key);
    atomic_set(&settings_ready, 1);
}
void motor_drive_save_request(bool requested) { atomic_set(&save_requested, requested); }
bool motor_drive_save_ready(void) { return atomic_get(&save_ready) != 0; }
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
static int read_encoder(int32_t *tenths) {
    // Encoder is signed little-endian tenths of a degree. Only this worker owns
    // the bus, so the request/read pair cannot interleave with another command.
    const uint8_t request[8] = {0xff,0xf9,2,0,0x46,0,0xf5,0};
    k_msleep(4);
    int rc = write_packet(request);
    if (rc) return rc;
    k_msleep(4);
    uint8_t bytes[4];
    rc = i2c_read(bus, bytes, 4, 0x10);
    if (rc) return rc;
    uint32_t bits = (uint32_t)bytes[0] | ((uint32_t)bytes[1] << 8) |
                    ((uint32_t)bytes[2] << 16) | ((uint32_t)bytes[3] << 24);
    memcpy(tenths, &bits, sizeof(*tenths));
    return 0;
}
static int initialize(int *center) {
    int rc = stop_both();
    if (rc) return rc;
    rc = read_encoder(&boot_raw);
    if (rc) return rc;
    *center = drive_angle((boot_raw % 3600) / 10);
    printk("BP_ENCODER,%u,%d,%d\n", k_uptime_get_32(), boot_raw, *center);
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
    // Readiness heartbeat without motor writes; platform auto-starts once.
    while (k_sem_take(&begin_drive, K_SECONDS(1)) != 0)
        printk("BP_DRIVE,%u,waiting,-1,0,-1,-1,0,0,0,0\n", k_uptime_get_32());
    drive_control_t control = {0};
    error = initialize(&control.center);
    steering_path_t steering=steering_begin(boot_raw,control.center,k_uptime_get_32());
    if (error) { control.mode = DRIVE_FAULT; stop_both(); }
    else { boot_center = control.center; atomic_set(&boot_ready, 1); }
    uint32_t printed = 0;
    drive_mode_t last_mode = DRIVE_FAULT;
    for (;;) {
        drive_input_t input = latest();
        if (!error && !atomic_get(&settings_ready)) { k_msleep(10); continue; }
        k_spinlock_key_t key = k_spin_lock(&input_lock);
        drive_configure(&control,runtime_settings.speed,runtime_settings.center,runtime_settings.range);
        k_spin_unlock(&input_lock, key);
        // A two-way handshake prevents input arriving during TLV I/O from
        // restarting either motor. Stop M2 explicitly: speed=0 alone is not
        // proof that its last position command has finished.
        bool neutral = !input.present || (drive_abs(input.y)<=64 && drive_abs(input.x)<=64 && !input.other_deflected);
        if (atomic_get(&save_requested) && !error &&
            (atomic_get(&save_ready) || (control.speed == 0 && neutral))) {
            if (!atomic_get(&save_ready)) {
                int stopped = stop_both();
                if (stopped) { error=stopped; control.mode=DRIVE_FAULT; }
                else { control.valid=false; control.armed=false; steering.issued=false; atomic_set(&save_ready,1); }
            }
            if (atomic_get(&save_ready)) { k_msleep(10); continue; }
        }
        if (!atomic_get(&save_requested)) atomic_set(&save_ready,0);
        // Bounded request/read pair on this worker's I2C bus; no vendor polling
        // loop or motion-completion wait. Continuous M1 writes retain priority.
        drive_plan_t plan = drive_plan(&control, &input, k_uptime_get_32());
        int rc = 0;
        if (plan.stop) { rc = stop_both(); steering.issued=false; }
        // Continuous drive first. Cached demands suppress repeated I2C writes.
        if (!rc && plan.speed) rc = speed(1, control.speed);
        if (!rc && !error && (uint32_t)(k_uptime_get_32()-steering.sampled)>=50) {
            int32_t raw;
            uint32_t began=k_uptime_get_32();
            rc=read_encoder(&raw);
            uint32_t now=k_uptime_get_32();
            if (!rc && (uint32_t)(now-began)>150) rc=-ETIMEDOUT;
            if (!rc && !steering_sample(&steering,raw,now)) rc=-ERANGE;
        }
        if (!rc && control.mode==DRIVE_ACTIVE && control.valid) {
            if (!steering_fresh(&steering,k_uptime_get_32())) rc=-ETIMEDOUT;
            else if ((uint32_t)(k_uptime_get_32()-input.received)>INPUT_TIMEOUT_MS) {
                // A slow bus read must not issue a new move on expired input.
                rc=stop_both(); control.valid=false; steering.issued=false;
            } else {
                int waypoint;
                if (steering_next(&steering,control.target_path,plan.target,&waypoint)) rc=position(waypoint);
            }
        }
        if (rc) {
            error = rc; control.mode = DRIVE_FAULT; control.armed = false;
            control.speed = 0; stop_both();
        }
        uint32_t now = k_uptime_get_32();
        if (control.mode != last_mode || (uint32_t)(now - printed) >= 200) {
            printk("BP_DRIVE,%u,%s,%d,%d,%d,%d,%u,%d,%u,%u\n", now, mode_names[control.mode],
                   input.owner, control.speed, control.valid ? control.target : -1, control.center,
                   writes, error, input.present ? now - input.received : 0, max_io_ms);
            printk("BP_STEERING,%u,%lld,%lld,%lld\n",now,(long long)steering.position_tenths,
                   (long long)control.target_path,(long long)steering.waypoint);
            printed = now; last_mode = control.mode;
        }
        k_msleep(10);
    }
}
K_THREAD_DEFINE(motor_drive_thread, 2048, worker, NULL, NULL, NULL, 7, 0, 0);

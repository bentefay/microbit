#include <zephyr/kernel.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>
#include "motor_bench.h"
#include "motor_bench_sequence.h"

static const struct device *const bus = DEVICE_DT_GET(DT_NODELABEL(i2c1));
K_SEM_DEFINE(begin, 0, 1);
static atomic_t started, cancelled;
static const char *stage = "waiting";
static unsigned current_step;
static int current_result;
K_MUTEX_DEFINE(status_lock);
static int write_packet(const uint8_t p[8]) {
    if (!device_is_ready(bus)) return -ENODEV;
    return i2c_write(bus, p, 8, 0x10);
}
static int wait_checked(unsigned ms) {
    for (unsigned elapsed = 0; elapsed < ms; elapsed += 20) {
        if (atomic_get(&cancelled)) return -ECANCELED;
        k_msleep(20);
    }
    return atomic_get(&cancelled) ? -ECANCELED : 0;
}
static void report(const char *state, unsigned step, int result) {
    k_mutex_lock(&status_lock, K_FOREVER);
    stage = state; current_step = step; current_result = result;
    printk("BP_MOTOR,%u,%s,%u,%d\n", k_uptime_get_32(), stage, current_step, current_result);
    k_mutex_unlock(&status_lock);
}
void motor_bench_status(void) {
    k_mutex_lock(&status_lock, K_FOREVER);
    printk("BP_MOTOR,%u,%s,%u,%d\n", k_uptime_get_32(), stage, current_step, current_result);
    k_mutex_unlock(&status_lock);
}
void motor_bench_start(void) {
    if (atomic_cas(&started, 0, 1)) k_sem_give(&begin);
}
void motor_bench_abort(void) { atomic_set(&cancelled, 1); }
static void worker(void *a, void *b, void *c) {
    (void)a; (void)b; (void)c;
    k_sem_take(&begin, K_FOREVER); // No I2C or motor commands before front-button start.
    const motor_bench_io_t io = {write_packet, wait_checked, report};
    motor_bench_sequence(&io);
    // Return permanently: another press/controller reconnect cannot restart it.
}
K_THREAD_DEFINE(motor_bench_thread, 1536, worker, NULL, NULL, NULL, 7, 0, 0);

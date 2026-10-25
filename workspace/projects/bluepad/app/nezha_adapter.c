// Build/link validation only. No startup/controller callback invokes this code.
#include "nezha_adapter.h"
#include "nezha_packet.h"
#include <errno.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#define NEZHA_ADDRESS 0x10
static const struct device *const bus = DEVICE_DT_GET(DT_NODELABEL(i2c1));
int nezha_write_motor(uint8_t port, int speed) {
    uint8_t packet[8];
    if (!nezha_motor_packet(port, speed, packet)) return -EINVAL;
    if (!device_is_ready(bus)) return -ENODEV;
    return i2c_write(bus, packet, sizeof(packet), NEZHA_ADDRESS);
}

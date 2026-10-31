#ifndef TEST_I2C_H
#define TEST_I2C_H
#include <stddef.h>
#include <stdint.h>
struct device { int unused; };
static const struct device fake_device={0};
#define DT_NODELABEL(name) 0
#define DEVICE_DT_GET(node) (&fake_device)
static inline int device_is_ready(const struct device *dev) { (void)dev; return 1; }
int i2c_write(const struct device *,const uint8_t *,size_t,uint16_t);
int i2c_read(const struct device *,uint8_t *,size_t,uint16_t);
#endif

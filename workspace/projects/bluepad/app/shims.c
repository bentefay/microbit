#include <stdarg.h>
#include <stdio.h>
#include <zephyr/sys/reboot.h>
void uni_logv(const char *fmt, va_list args) { vfprintf(stdout, fmt, args); }
void uni_console_init(void) {}
void uni_system_reboot(void) { sys_reboot(SYS_REBOOT_COLD); }

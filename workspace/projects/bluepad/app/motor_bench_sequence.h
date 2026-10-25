#ifndef MOTOR_BENCH_SEQUENCE_H
#define MOTOR_BENCH_SEQUENCE_H
#include <stdint.h>
#include <errno.h>

// Fixed loose-shaft commissioning sequence. No continuous-speed commands.
// Encoding matches pinned pxt-nezha2 move()/setServoSpeed()/stop().
typedef struct {
    int (*write)(const uint8_t packet[8]);
    int (*wait)(unsigned ms); // returns -ECANCELED if a stop was requested
    void (*event)(const char *state, unsigned step, int result);
} motor_bench_io_t;
static inline int motor_bench_stop(const motor_bench_io_t *io, unsigned port) {
    const uint8_t p[8] = {0xff,0xf9,port,0,0x5f,0,0xf5,0};
    return io->write(p);
}
static inline int motor_bench_sequence(const motor_bench_io_t *io) {
    unsigned step = 0;
    int result = motor_bench_stop(io, 1);
    int other = motor_bench_stop(io, 2);
    if (!result) result = other;
    if (result) goto finished;
    io->event("countdown", 0, 0);
    result = io->wait(3000);
    if (result) goto finished;
    // 15 percent maps to 135 in the vendor servo-speed command.
    const uint8_t speed[8] = {0xff,0xf9,0,0,0x77,0,0,135};
    result = io->write(speed);
    if (result) goto finished;
    for (step = 1; step <= 4; step++) {
        unsigned port = (step - 1) / 2 + 1, direction = (step - 1) % 2 + 1;
        const uint8_t move[8] = {0xff,0xf9,port,direction,0x70,0,2,20};
        result = io->wait(20);
        if (result) break;
        result = io->write(move);
        io->event("move", step, result);
        if (result) break;
        result = io->wait(1000);
        if (result) break;
        result = motor_bench_stop(io, port);
        io->event("stop", step, result);
        if (result) break;
        result = io->wait(1000);
        if (result) break;
    }
finished:
    // Attempt both stops even after an I2C error; never retry movement.
    other = motor_bench_stop(io, 1);
    if (!result) result = other;
    other = motor_bench_stop(io, 2);
    if (!result) result = other;
    io->event(result == -ECANCELED ? "aborted" : result ? "fault" : "done", step > 4 ? 4 : step, result);
    return result;
}
#endif

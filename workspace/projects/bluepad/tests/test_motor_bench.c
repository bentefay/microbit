#include <assert.h>
#include <string.h>
#include "motor_bench_sequence.h"
static uint8_t packets[32][8];
static unsigned writes, waits, fail_at, cancel_at, moves;
static const char *last_state;
static int write_packet(const uint8_t p[8]) {
    assert(writes < 32);
    memcpy(packets[writes++], p, 8);
    assert(p[0] == 0xff && p[1] == 0xf9);
    assert(p[4] == 0x5f || p[4] == 0x70 || p[4] == 0x77);
    if (p[4] == 0x70) {
        assert(p[2] >= 1 && p[2] <= 2 && p[3] >= 1 && p[3] <= 2);
        assert(p[5] == 0 && p[6] == 2 && p[7] == 20);
        moves++;
    }
    return writes == fail_at ? -EIO : 0;
}
static int wait_checked(unsigned ms) {
    assert(ms == 3000 || ms == 1000 || ms == 20);
    return ++waits == cancel_at ? -ECANCELED : 0;
}
static void event(const char *state, unsigned step, int result) {
    (void)step; (void)result; last_state = state;
}
static void reset(void) { writes = waits = moves = fail_at = cancel_at = 0; last_state = NULL; }
int main(void) {
    const motor_bench_io_t io = {write_packet, wait_checked, event};
    reset();
    assert(motor_bench_sequence(&io) == 0);
    assert(!strcmp(last_state, "done") && writes == 13 && waits == 13 && moves == 4);
    const uint8_t speed[8] = {0xff,0xf9,0,0,0x77,0,0,135};
    assert(memcmp(packets[2], speed, 8) == 0);
    for (unsigned i = 0; i < 4; i++) {
        assert(packets[3 + 2*i][2] == i/2 + 1 && packets[3 + 2*i][3] == i%2 + 1);
        assert(packets[4 + 2*i][4] == 0x5f && packets[4 + 2*i][2] == i/2 + 1);
    }
    for (unsigned failure = 1; failure <= 13; failure++) {
        reset(); fail_at = failure;
        assert(motor_bench_sequence(&io) == -EIO);
        assert(!strcmp(last_state, "fault"));
        for (unsigned i = failure; i < writes; i++) assert(packets[i][4] == 0x5f);
        assert(packets[writes-1][2] == 2 && packets[writes-1][4] == 0x5f);
    }
    for (unsigned cancel = 1; cancel <= 13; cancel++) {
        reset(); cancel_at = cancel;
        assert(motor_bench_sequence(&io) == -ECANCELED);
        assert(!strcmp(last_state, "aborted"));
        assert(packets[writes-2][2] == 1 && packets[writes-2][4] == 0x5f);
        assert(packets[writes-1][2] == 2 && packets[writes-1][4] == 0x5f);
    }
}

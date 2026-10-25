#include <assert.h>
#include <stdint.h>
#include "start_gate.h"
int main(void) {
    for (unsigned button = 1; button <= 3; button++) {
        start_gate_t gate = {0};
        assert(!start_gate_update(&gate, 0, button));
        assert(!start_gate_update(&gate, 1000, button)); // held at boot
        assert(!start_gate_update(&gate, 1020, 0));
        assert(!start_gate_update(&gate, 1060, 0));
        assert(!start_gate_update(&gate, 1080, button));
        assert(!start_gate_update(&gate, 1100, 0)); // bounce
        assert(!start_gate_update(&gate, 1120, button));
        assert(!start_gate_update(&gate, 1140, button));
        assert(start_gate_update(&gate, 1160, button) == button);
        assert(!start_gate_update(&gate, 1200, button));
        assert(!start_gate_update(&gate, 1220, 0));
        assert(!start_gate_update(&gate, 1300, button));
        assert(!start_gate_update(&gate, 1400, button)); // one start per boot
    }
    start_gate_t wrap = {.changed = UINT32_MAX - 20};
    assert(!start_gate_update(&wrap, 30, 0));
    assert(!start_gate_update(&wrap, 40, 2));
    assert(start_gate_update(&wrap, 80, 2) == 2);
}

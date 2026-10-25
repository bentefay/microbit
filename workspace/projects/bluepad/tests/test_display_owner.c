#include <assert.h>
#include "display_owner.h"
int main(void) {
    display_owner_t s = {.owner = -1};
    display_join(&s, 0); display_join(&s, 1);
    assert(display_peers(&s) == 3);
    assert(display_input(&s, 0, 20, 30) && s.owner == 0);
    assert(!display_input(&s, 1, -30, 40)); // joining at rest doesn't steal
    for (int i = -50; i < 50; i++) assert(!display_input(&s, 1, i, -i));
    // A slow sweep accumulates against the last movement anchor.
    for (int i = 0; i <= 220; i += 10) display_input(&s, 1, i, 0);
    assert(s.owner == 1);
    assert(!display_input(&s, 0, 22, 32));
    assert(display_input(&s, 1, 0, 0)); // release returns owner's dot to center
    assert(display_input(&s, 0, -300, 0) && s.owner == 0);
    assert(!display_input(&s, 1, 0, 0)); // repeated idle packets cannot steal
    display_leave(&s, 1); assert(s.owner == 0 && display_peers(&s) == 1);
    display_join(&s, 1); assert(!display_input(&s, 1, 0, 0));
    display_leave(&s, 0); assert(s.owner == 1 && s.pad[1].x == 0);
    display_leave(&s, 1); assert(s.owner == -1 && display_peers(&s) == 0);
    assert(!display_input(&s, 1, 400, 0)); // late report after disconnect
    display_join(&s, 1); assert(display_input(&s, 1, 0, 0));
    assert(!display_input(&s, 2, 400, 0));
}

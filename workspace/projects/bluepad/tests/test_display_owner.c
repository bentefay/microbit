#include <assert.h>
#include "display_owner.h"
static const uint8_t blue[6] = {0x5c, 0xba, 0x37, 0xdd, 0xd9, 0x6c};
static const uint8_t eli[6] = {0x5c, 0xba, 0x37, 0x67, 0x7f, 0xda};
int main(void) {
    for (unsigned parent = 0; parent < 2; parent++) {
        unsigned child = 1 - parent;
        display_owner_t s = {.owner = -1};
        display_join(&s, parent, blue); display_join(&s, child, eli);
        assert(display_supervisor_slot(&s) == (int)parent);
        assert(display_input(&s, child, 0, -512, 0));
        assert(!display_input(&s, parent, 33, 34, 0)); // neutral jitter cannot steal
        assert(s.owner == (int)child && !s.override_latched);
        assert(display_input(&s, parent, 0, 511, 0)); // shared mode: blue movement
        assert(!s.override_latched && s.owner == (int)parent);
        assert(display_input(&s, child, 200, -512, 1)); // Eli A is ordinary input
        assert(!s.override_latched && s.owner == (int)child);
        assert(!display_input(&s, parent, 0, 511, 0)); // held position cannot steal
        assert(display_input(&s, parent, 0, 511, 1)); // A takes control even without movement
        assert(s.override_latched && s.owner == (int)parent);
        for (int i = 0; i < 100; i++) {
            assert(!display_input(&s, child, i % 2 ? 511 : -512, -512, i % 2));
            assert(display_input(&s, parent, 0, 511, 1)); // held A toggles only once
            assert(s.override_latched && s.owner == (int)parent && s.pad[s.owner].y == 511);
        }
        assert(display_input(&s, parent, 0, 0, 0)); // neutral blue still owns override
        assert(!display_input(&s, child, 0, -512, 0));
        assert(s.override_latched && s.owner == (int)parent);
        assert(display_input(&s, parent, 0, 0, 1)); // second A restores shared mode
        assert(!s.override_latched);
        assert(display_input(&s, child, -300, -512, 0));
        assert(s.owner == (int)child);
        display_input(&s, parent, 0, 0, 0);
        display_input(&s, parent, 0, 511, 1); // toggle works with deflected sticks, too
        assert(s.override_latched);
        display_input(&s, parent, 0, 511, 0);
        display_input(&s, parent, 0, 511, 1);
        assert(!s.override_latched);
        display_input(&s, parent, 0, 511, 0);
        display_input(&s, parent, 0, 511, 1);
        display_leave(&s, parent);
        assert(s.owner == -1 && s.override_latched);
        assert(!display_input(&s, child, 0, -512, 1));
        assert(!display_input(&s, parent, 0, 511, 0)); // late disconnected input ignored
        display_leave(&s, child);
        assert(s.owner == -1 && display_peers(&s) == 0 && s.override_latched);
        // Swap connection order: the role follows the identity, not the old slot.
        display_join(&s, parent, eli);
        display_input(&s, parent, 0, -512, 1);
        assert(s.owner == -1 && s.override_latched);
        display_join(&s, child, blue);
        assert(s.owner == -1); // no stale input on reconnect
        display_input(&s, child, 0, 0, 1); // held A at reconnect must not toggle
        assert(s.owner == (int)child && s.override_latched);
        display_input(&s, child, 0, 0, 0);
        display_input(&s, child, 0, 0, 1);
        assert(!s.override_latched);
        display_input(&s, parent, 300, -512, 0);
        assert(s.owner == (int)parent);
        display_leave(&s, parent); // shared mode falls back to remaining blue
        assert(s.owner == (int)child);
        display_leave(&s, child);
        assert(s.owner == -1 && display_peers(&s) == 0);
        display_join(&s, parent, blue);
        display_input(&s, parent, 0, 511, 1); // initial held A doesn't enter override
        assert(!s.override_latched && s.owner == (int)parent);
        display_join(&s, child, eli);
        display_input(&s, child, 0, -512, 0); // first deflected report can take over
        assert(s.owner == (int)child);
        display_input(&s, child, 9999, -9999, 0);
        assert(s.pad[child].x == 511 && s.pad[child].y == -512);
        assert(!display_input(&s, 2, 0, 0, 0));
    }
}

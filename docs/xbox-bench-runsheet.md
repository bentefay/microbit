# Xbox bench runsheet: minimal human involvement

The assistant prepares code, tests, builds, authorized flashing and continuous
monitoring before requesting physical actions. Builds and flashing remain separate.
Motors stay disconnected throughout these diagnostic stages.

## Two-controller extension

The current firmware supports two active links. A front-button press is required
only once per micro:bit boot. Initial discovery/setup is serialized; ready links
remain active together. After that, either controller may turn off/on without
resetting the board or pressing its buttons again. Meaningful left-stick motion
selects the display owner. Idle jitter does not steal ownership. Losing the owner
falls back to the remaining controller's most recent input; losing both clears it.

| Check | Physical action after readiness cue | Evidence | Status |
| --- | --- | --- | --- |
| Concurrent input and handover | Both on, front button once, move each left stick in turn | Mask 3, distinct identities, both per-pad display-write counters increase | Passed: B start, two active links; 522 and 441 concurrent display writes at checkpoint |
| First off/on | First off; move second; first on normally and move its stick | Second remains connected; first reconnects and controls display | Passed: saved-bond re-encryption, unchanged second connection; user confirmed |
| Second off/on | Second off; move first; second on normally and move its stick | First remains connected and reports input; second reconnects | Passed: solo input from first, saved-bond re-encryption for second; user confirmed |
| Both off/on | Both off; then both on normally | Mask 0/owner -1, then mask 3 and fresh input without another front-button press | Passed: both saved bonds reused, input/display ownership recovered; user confirmed |

`run bluepad dual-report CAPTURE.jsonl` tracks each controller separately. Slot
numbers follow connection order and are not permanent controller identities.
The earlier single-connection checks below are historical baseline evidence.

## Session procedure

1. Prepare and verify the firmware; start `run bluepad monitor`.
2. Observe a fresh `waiting` heartbeat. For LED checks also verify
   `BP_DISPLAY` reports ready. Do not infer readiness from USB presence alone.
3. Send one visible action card with the complete physical sequence. The user
   starts by pressing/releasing micro:bit A or B; no typed confirmation is needed.
4. Keep monitoring while the assistant turn is active. Human response time has no
   test deadline. Firmware starts scanning once per boot and retains the start
   button in its heartbeat, so a missed serial instant does not lose the signal.
5. Evaluate captured evidence and request only the missing physical observations.
   Save the result before moving to the next stage. Do not rebuild or repeat passed
   actions unless a change or failure warrants it.

`run bluepad report CAPTURE.jsonl` reports the latest observed boot's control
coverage and display update count. Previous boot data stays in the raw capture.
The recorder can continue after an assistant turn, but a running recorder alone
does not schedule the assistant to resume; live supervision requires an active turn.

## Stages

| Stage | User action, after readiness cue | Automatic evidence | Status |
| --- | --- | --- | --- |
| First controller pairing | Pair mode, press A | Start latch, encryption/pairing/HID logs | Passed |
| Input coverage | Sweep both sticks, squeeze triggers, press face buttons and D-pad, release | Ranges, button masks, sampled neutral return | Passed |
| Left-stick LED feedback | Same controller on, press either button, move left stick | Start latch, connection, framebuffer update count | Passed via A; both left axes covered, 1658 display updates at checkpoint |
| Alternate start button | Press B for a later fresh session | B start latch | Passed during the two-controller session |
| Visual correctness | Watch dot move with left stick; report only problems | Requires human eyes; telemetry cannot prove visible output | Passed: user confirmed correct and responsive |
| Controller off/on | Turn controller off, wait for next cue, turn it on normally | Disconnect/reconnect events, new reports | Passed: existing bond reused, encryption and input recovered; user confirmed display |
| Board restart persistence | Reset micro:bit, then press either front button with controller on | New boot, retained bond, encrypted reconnect without pairing | Passed: A detected first, bond resolved, re-encryption and new input; zero new pairings |
| Second controller | First controller off; second in pairing mode, start fresh session | Identity distinction, pairing, input coverage | Passed: distinct identity, firmware 5.23.6.0, all input checks and neutral return |
| Both saved pairings | Turn second off; restart micro:bit, start first normally; then switch back to second | Existing bond resolution and re-encryption for each, no new pairing | Passed: both identities resolved after restart; two connections, zero pairings in that boot |
| Motor commissioning | Separate controlled bench setup and measured steering limits | Separate implementation and review | Not authorized by these diagnostic starts |

Keep restart persistence distinct from pairing again. Time between a cue and input
includes human reaction; it is not radio latency. A firmware heartbeat proves loop
liveness, not controller radio freshness. The LED display is visual feedback with
a nominal 50 Hz scan, not an instrumented end-to-end latency measurement.

The second controller initially felt slower. `run bluepad timing CAPTURE.jsonl`
confirmed roughly 60 ms mean callback spacing during sampled movement, versus
15 ms for recent first-controller sessions. After a normal second-controller
reconnect, its estimate became 15 ms and the user reported improved responsiveness.
No firmware change was made between those two second-controller sessions. Both
controllers have exhibited 60 ms in an early session; this is not established as
a fixed hardware difference. Root cause and negotiated BLE parameters remain
unverified. If revisited, add connection-parameter telemetry before changing policy.

# Xbox bench runsheet: minimal human involvement

The assistant prepares code, tests, builds, authorized flashing and continuous
monitoring before requesting physical actions. Builds and flashing remain separate.
Motors stay disconnected for controller-only stages. The separately authorized
loose-motor stage below uses connected, secured free shafts.

## Native loose-motor sequence

The finite sequence below passed. The current build, `--motor-drive`, defaults to Xbox
left Y for continuous M1 speed (20% cap) and right X for M2 position (±45° around
its captured loose-shaft centre, 15% speed). Use the same confirmed free-shaft
setup. Bluetooth starts automatically at boot; neutral control axes enable movement. Both
sticks participate in shared ownership; blue Xbox A toggles exclusive ownership.
Only changed demands generate motor writes. A+B latches a stop until reset.

The first continuous run exposed neutral GET_REPORT readbacks interrupting held
inputs. That readback is removed from the control path; independent HID Information
reads now test peer liveness without altering axes. Both sticks now do the same job.
After live readiness, hold either stick up for three seconds, then centre; hold
it sideways for three seconds, then release. Repeat with the other stick to check
the new mapping and dot selection; no need to repeat the finite-motor test.
Then enable blue override, oppose Eli up with blue down, centre blue, disable
override and move Eli's stick. Confirm continuous rotation, steering returning
to its starting position, and override. Use telemetry to check input freshness,
speed/target ranges, command-write suppression and I2C results automatically.
Corrected continuous control and either-stick mapping passed: Ben said "That's
perfect." The liveness probes receive actual replies without replacing controls;
held demands stay continuous and unchanged demands produce no extra motor writes.
Do not repeat the finite sequence or the full stick exercise.

Each Xbox B switches only that controller between split controls (left Y drive/right
X steering) and either-stick controls, defaulting to split on each connection.
Both modes retain blue A override. The B-toggle capture recorded Eli switching
split/either/split; no repeat of the motor exercise is needed. For automatic startup,
check telemetry for a zero start-button mask, controller connection and split mode.
Controllers already powered on may reconnect without any new human action.
Passed after the 08:18 UTC flash: both controllers connected with start mask zero,
both reported split mode, and blue input drove active commands with I2C result zero.

Ben authorized the motor test and confirmed both motors remain loose, secured,
clear of hands/objects, with the Nezha power switch accessible. No steering linkage
is attached, so this stage does not require or establish chassis steering limits.
Use `run build bluepad --motor-bench`, then explicitly
`run flash bluepad --motor-bench --confirm`. Monitor readiness before the action cue.

One front micro:bit A or B press starts all four steps: M1 clockwise and reverse,
then M2 clockwise and reverse, 20 degrees each at 15 percent. The sequence stops
between moves and ends permanently until reset. A+B aborts. Capture `BP_MOTOR`
stages and ask for one combined physical confirmation of both movements/stopping.
Xbox inputs still show on the matrix but do not drive these automatic motor steps.
Passed: front A started the run; all four movement and stop commands succeeded,
and Ben confirmed both motors moved in both directions. The earlier MakeCode
motor control is not linked into this native app.
Use continuous speed for M1 (not repeated finite moves) and a stick-mapped target
position for M2 (not accumulating increments). Send only changed demands, with
drive commands first; use the nonblocking protocol and retain the vendor's 4 ms
position-command bus settling interval. The one-second bench pauses are not part
of the driving loop. Native Xbox-driven control is implemented separately above.

## Two-controller extension

The current firmware supports two active links and starts Bluetooth automatically
at boot. Initial discovery/setup is serialized; ready links
remain active together. After that, either controller may turn off/on without
resetting the board or pressing its buttons again. Meaningful left-stick motion
selects the display owner in shared mode. Idle jitter does not steal ownership.
Blue Xbox A toggles exclusive override, tied to address `5C:BA:37:DD:D9:6C`;
Eli's gray/orange controller is `5C:BA:37:67:7F:DA`. Holding A does not repeat the
toggle, and A already held on connection is ignored until released and pressed.
Override off restores shared mode. In shared mode, losing the owner falls back to
the remaining controller's most recent input; losing both clears it. In override,
losing blue clears the matrix and keeps the mode latched until blue reconnects.
Resetting the micro:bit starts shared mode again. This remains a motor-free diagnostic.

The existing connection checks below passed before the override update. The new
physical toggle/shared-control check also passed: Ben confirmed "Tested. Perfect!"
after the cue to oppose Eli up with blue down in override, centre blue while Eli
moves, then tap blue A again and confirm shared handover. Telemetry records both
identities connected, override enabled at 419179 ms with blue owning the display,
and disabled at 431164 ms. Both controllers drove the display during this session.
Container tests also cover both slot orders, held A, Eli's A, opposing input and
disconnect/reconnect with swapped slots. Blue off/on while override is latched
has automated coverage but has not yet been physically verified in this update.

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

# Bluepad container integration validation

## Xbox continuous drive and position steering

The `--motor-drive` variant now uses the selected Xbox input for continuous M1
speed (left Y, ±20%) and M2 position (right X, ±45° from captured encoder centre,
15% servo speed). It is for the already-confirmed loose-shaft bench. Front A/B
initializes stopped outputs and begins scanning; neutral input enables movement.
Blue Xbox A exclusively selects blue input for both motors, by its stable identity.
Shared mode accepts meaningful motion of either stick; it does not mix controllers'
individual axes. Owner disconnect requires neutral before enabling again.

Motor I2C runs in its own thread, checks the latest snapshot every 10 ms and sends
only changed speed/target demands, drive first. Position commands retain 4 ms bus
settling; no 500 ms motion wait or loop encoder polling is used. A+B and I2C faults
latch stop until reset. Reports older than 500 ms stop output; stale non-neutral
input also requires neutral before resuming. Quiet idle at neutral remains ready.

Earlier captures show long gaps in unchanged Xbox notifications. The selected
controller is therefore queried asynchronously with `hids_host_send_get_report`
(report 1) after 150 ms of quiet. Pinned `hids_host.c` dispatches successful reads
as normal HID reports, and `uni_bt_le.c` parses them through the controller callback.
Requests and readiness never count as fresh data. `BP_POLL` records attempts;
`BP_DRIVE` exposes requested outputs, input age, write count and maximum observed
I2C write duration. Hardware support for these reads and continuous control is pending.
These paths were inspected through the checked-in `run bluepad inspect` command;
the header is `ble/gatt-service/hids_host.h` (not `hids_client.h`).

Validation: 57 CLI tests / 714 assertions and seven C suites with ASan/UBSan pass.
Coverage includes held continuous demand without repeated writes, steering wrap,
centering, input timeout and neutral recovery, disconnect generations, terminal
abort/fault, both controller-slot orders, opposing inputs under override, and
right-stick-only shared ownership. Explicit flash selection protects default
motor-free and finite-bench variants. Native build: 248708 B flash, 53352 B static
RAM. HEX SHA-256:
`efdb52f765e911b4c713f0e8def2b1a63cff858dd59dc8851d212ac2e8b5f35a`.
Flashed at 07:59:58 UTC with same-device remount and no `FAIL.TXT`. The live
monitor observed waiting firmware and `BP_DRIVE` waiting with zero motor writes.
Capture: `.cache/observations/2026-10-25T08-00-02-265Z-bluepad-session-f4eb9555.jsonl`.

## Native finite loose-motor bench

Ben requested motor testing, confirmed secured loose shafts with no wheels/linkage
and an accessible Nezha power switch, and asked for minimal physical test rounds.
The `--motor-bench` variant combines four finite 20-degree/15-percent requests
(M1 CW/CCW, M2 CW/CCW) into one front-button-started run, with intervening stops.
It performs no I2C writes before that press and cannot repeat without reboot.
Xbox input/override remains available for the matrix, not motor commands yet.

Packet encodings were checked against the locally pinned vendor source via
`run inspect /workspace/projects/car/pxt_modules/pxt-nezha2/main.ts`. The separate
Zephyr motor thread owns the external I2C bus; the pinned TWIM implementation and
Kconfig were inspected with `run bluepad inspect`. Transfer timeout is 100 ms.
I2C failures stop the sequence and attempt both stops; A+B requests cancellation.
No software stop-time bound or loaded steering performance is claimed.

Validation: 55 CLI tests / 703 assertions passed. Six native C suites passed under
ASan/UBSan, including all four finite packets, command ordering, failures injected
at every write and cancellation at every wait. Explicit flash variant checks reject
accidental bench selection and the compile-only adapter. Both native builds passed:
default report-only remains motor-free at 246256 B flash / 50872 B static RAM;
motor bench is 247464 B flash / 52776 B RAM. Bench HEX SHA-256:
`255f57c7efab503eea5b8caeb645033bddf84ea232eb30a2dd83aa62f7f2e61d`.
Flashed at 07:48:36 UTC, same-device remount with no `FAIL.TXT`. Fresh waiting
heartbeats and `BP_MOTOR` waiting/step 0/result 0 confirm the start gate is pending.
Physical movement passed: Ben confirmed both motors moved in both directions.
Front A started the countdown at device time 131088 ms; steps 1–4 issued movement
at 134134, 136175, 138211 and 140252 ms, each followed by a successful stop.
The sequence completed at 142276 ms with result 0; all movement/stop writes
succeeded. This confirms observed bidirectional motion, not exact angle accuracy
or loaded steering performance. Snapshot:
`.cache/observations/bluepad-motor-result.json`. Capture:
`.cache/observations/2026-10-25T07-48-39-291Z-bluepad-session-7f6ae58f.jsonl`.

### Motor API delay and intended continuous controls

The pinned vendor `moveToAbsAngle()` waits 4 ms after its I2C write and defaults
to another 500 ms through `motorDelay(0.5, Second)`. Relative degree/turn moves
default to estimated travel time plus 500 ms. Passing `DelayMode.NoDelay` removes
the optional wait, retaining the position-command settling interval. `start()`
and `stop()` have no such automatic motion wait. The existing MakeCode `drive.ts`
already sends changed continuous M1 speeds and changed M2 targets with `NoDelay`.

The native bench writes protocol packets directly, so none of those optional API
waits apply. Its deliberate one-second movement/stop spacing is diagnostic only.
For native Xbox control, preserve continuous M1 demand until changed or stopped,
send only changed speed/steering targets, and map right-stick position to M2's
position around the captured/measured centre. Repeated relative increments would
accumulate steering error and are not the intended control. Keep I2C work outside
the Bluetooth callback and preserve 4 ms exclusive bus settling after position
writes without waiting for physical motion. That native driving integration is
the next implementation; the currently flashed bench is still a finite sequence.

## Blue-controller A-button override

Blue Xbox address `5C:BA:37:DD:D9:6C` is the only identity allowed to toggle
override. Its fresh A press toggles shared/exclusive control. Shared mode retains
the prior motion-anchor selection exactly; exclusive mode always selects blue,
including at centre. Holding A does not repeatedly toggle; A held at connection
requires release and a fresh press. Eli's address `5C:BA:37:67:7F:DA` cannot toggle.
On blue disconnection during override, the display clears and mode stays latched.
Blue reconnects into override, even in the opposite slot. Reset starts shared mode.

Validation: 53 CLI tests passed (688 assertions), plus all five native C suites
under Docker ASan/UBSan. Tests exercise both slot orders, both motion ownership
directions, opposing child input, child A, held A, neutral and deflected toggles,
disconnect/reconnect with swapped slots, both absent and shared-mode fallback.
The native build passes artifact checks, with no motor adapter or motor calls:
246256 bytes flash, 50872 bytes static RAM. HEX SHA-256:
`af5452bc4040615635df5fb8be1d187c88ed5ace2f94b3d140a5c6a55ac1146b`.
`BP_PRIORITY` records every toggle before snapshot throttling, plus heartbeat
state. The CLI reports current mode, blue slot and recent transitions.
Flashed at 07:32:58 UTC with same-device remount and no `FAIL.TXT`. Live waiting
heartbeats confirm matrix readiness and initial shared mode. Current capture:
`.cache/observations/2026-10-25T07-33-03-338Z-bluepad-session-06f480b9.jsonl`.

Physical toggle/shared-control check passed: Ben confirmed "Tested. Perfect!"
after the opposing-stick, blue-centre and return-to-shared-control sequence.
The capture shows front micro:bit A start, both identities connected (blue slot 1),
override on at device time 419179 ms with owner 1, and override off at 431164 ms.
At the saved checkpoint there were 1775 reports and 492/804 per-controller display
writes while both connected. Final mode was shared. The snapshot is saved locally
as `.cache/observations/bluepad-override-result.json`. This confirms the tested LED
behavior, not motor control. Disconnect/reconnect while override is latched has
automated coverage only; prior physical connection checks below predate this change.

## Two simultaneous controllers: implementation

The native image now provisions two connections in Zephyr, BTstack and Bluepad32,
with corresponding client pools and larger packet buffers. No upstream files were
modified. A discovery callback serializes setup because the pinned Device
Information Service client is a singleton. Once ready, both HID links stay active.

The display owner is selected by deliberate left-stick motion (64-unit change
from a motion anchor and 96-unit deflection). The owner's every report updates the
unfiltered dot before the per-controller 5 Hz serial limiter. Idle reports cannot
overwrite the other controller's dot. Disconnecting the owner selects the other
controller's last known input; disconnecting both clears the display. Scan/reconnect
continues after either disconnect, with the existing once-per-boot button gate.

`BP_PAD`, `BP_READY`, `BP_GONE`, `BP_SLOT` and `BP_PEERS` keep the two devices'
identities, reports, readiness and ownership distinct. `bluepad dual-report` also
counts writes performed by each pad while both were ready, solo-input snapshots
and reconnections by address. The monitor can be safely restarted through
`bluepad monitor-stop`, scoped to this repo's mounted serial transport.

Validation: 52 CLI tests passed (683 assertions). Packet, button, frame and
ownership C tests passed with ASan/UBSan in Docker. Ownership tests cover idle
jitter, slow deliberate motion, neutral return, loss of either owner/non-owner,
fallback, losing both, rejoining and late reports from a disconnected slot.
The build passed artifact checks: 245908 bytes flash, 50872 bytes static RAM.

Flashed at 06:50:45 UTC; same-device remount, no `FAIL.TXT`, then live `waiting`
heartbeats. HEX SHA-256:
`a472ffb559ca26b5b9b66cf50276a299c2684f159027af765b4395bea7e23af5`.
The user started with B. Both controller identities completed HID setup and stayed
connected simultaneously (mask 3). Each controlled the display: per-controller
counters recorded 522 and 441 framebuffer writes while both were connected at the
saved checkpoint. The initial report is saved locally as
`.cache/observations/bluepad-dual-handover-result.json`. Independent power-cycle
recovery checks also passed in both directions: each identity's connection count
reached two, both used their saved bonds to re-encrypt, the other link stayed up,
and each regained display control. The user confirmed both worked perfectly.
Solo-input snapshots were also recorded from the first during the second's absence.
Both-off recovery also passed: capture times 515.2 s (zero links, owner -1),
520.9 s (first ready again), and 522.5 s (both ready again) show recovery without a
board restart or another A/B press. Both identities resolved their saved bonds and
re-encrypted, then supplied input and drove the display. The user confirmed the
check worked. The controllers were subsequently switched off again; the final
zero-link state is expected, not a failure of that recovery. The complete report
is saved locally as `.cache/observations/bluepad-dual-complete-result.json`.
New capture:
`.cache/observations/2026-10-25T06-50-55-316Z-bluepad-session-8e130e25.jsonl`.

## Both bonds retained; report cadence comparison

After pairing the second controller, the user switched it off, restarted the
micro:bit, and started the first controller normally. Its identity resolved from
the stored bond and re-encryption succeeded. Switching back to the second, without
another board reset, likewise resolved its stored identity and re-encrypted. The
boot recorded two connections and zero pairing events, with fresh input after the
switch. Both saved pairings survived the restart; active connections remain limited
to one. Brief "no more available device slots" logs during the swap ended when the
first link's supervision timeout freed the slot; the second then connected.

The user reported that the second initially felt slower. The checked-in
`run bluepad timing CAPTURE.jsonl` command estimates callback cadence from device
timestamp and report-counter differences between 90–250 ms snapshots whose axes
change by at least 16 units. It separates connections and resets, excludes long
idle gaps, and reports the median of the per-window mean spacings.

| Connection sample | Moving windows at checkpoint | Median mean callback spacing |
| --- | ---: | ---: |
| First controller, earliest capture (before LED firmware) | 39 | 60 ms |
| First controller, LED sessions | 234 / 251 / 105 / 211 | 15 ms |
| Second controller, initial pairing session | 280 | 60 ms |
| Second controller, normal bonded reconnect | 74 | 15 ms |

The user confirmed the second felt much better after reconnecting. There was no
firmware change between its 60 ms and 15 ms sessions. These are callback-cadence
estimates, not measurements of individual packet jitter, negotiated BLE interval,
physical input latency or LED onset. The underlying cause remains unverified;
connection-parameter telemetry is the next diagnostic if the slower state recurs.
Both remembered-pairing checks and this comparison passed without motor code.
The CLI suite now passes 51 tests with 668 assertions, including the timing report.

## Second controller

The second controller presented a distinct identity and Microsoft firmware
`5.23.6.0`. Pairing, HID setup and input succeeded. All four axes reached
-512..511, both triggers reached 1023, A/B/X/Y and all D-pad directions were
observed, and the sampled neutral-return check passed. The checkpoint recorded
429 snapshots and 845 input-driven framebuffer updates. The report is saved
locally as `.cache/observations/bluepad-second-controller-result.json`.

The pinned application config has `NVM_NUM_DEVICE_DB_ENTRIES=2` (two stored BLE
bonds), while Zephyr, BTstack and Bluepad32 are configured for one active
controller connection. Two remembered pairings do not imply simultaneous input.
Switching between both saved pairings subsequently passed, as recorded above.

## Saved pairing after micro:bit reset

The user reset the micro:bit with the controller still on, then pressed the front
buttons (A was accepted first). The capture observed boot output and reset uptime,
the start latch, resolution of the existing controller identity, successful
re-encryption and HID setup. The new boot recorded one connection, zero pairing
events and 107 input-driven display updates at the checkpoint. This establishes
saved-pairing recovery after a micro:bit reset. It does not establish bond retention
through a firmware reflash; the earlier reflash session performed fresh pairing.

Evidence remains in the continuous capture named below; the latest-boot report is
also saved locally as `.cache/observations/bluepad-restart-result.json`.

## Controller power-cycle recovery

The user turned the controller off and on normally. The micro:bit remained running.
The capture recorded a disconnect (reason `0x08`, supervision timeout), identity
resolution from the existing bond, successful re-encryption, HID reconnection and
fresh input. The user confirmed the display worked again. There were two HID
connections and only one pairing in this firmware boot, so recovery reused the
bond. This establishes controller power-cycle recovery, separately from whether
the bond persists across a micro:bit restart. The physical off instant was not
instrumented, so no radio-loss detection latency is claimed.

## Left-stick matrix update

Added the previous moving-dot display to the native diagnostic using the pinned
Nordic matrix driver's brightness framebuffer. Every input callback updates it
before serial snapshot throttling. Nominal scan refresh is 50 Hz; no smoothing or
additional display delay is introduced. The display is blank until input arrives
and clears on a reported disconnect. See the [bench runsheet](xbox-bench-runsheet.md).

Validation: 48 CLI tests passed (657 assertions). Packet, button-gate and new
joystick-frame C tests passed with ASan/UBSan in the offline container. The native
report-only build passed its existing artifact checks, using 244332 bytes flash
and 36104 bytes static RAM. Frame tests cover orientation, corners, center,
intermediate brightness, extreme inputs and total brightness across a grid.

Flashed at 06:25:44 UTC, same-device remount and no `FAIL.TXT`. HEX SHA-256:
`a7d3c2e97f55781ab8de2edd16c1351eba5edcb02f20c3defeca56f82409e559`.
The ongoing capture observed the new boot, `waiting` heartbeats and display-ready
telemetry. A physical A-button start then connected the same controller. Its
left X/Y axes each reached -512..511, returned to neutral, and the display counter
recorded 1658 input-driven framebuffer updates at the checkpoint. The user then
confirmed the visible dot was correct and responsive. This is a passed visual
feedback check, not a numerical latency measurement. The connection performed fresh pairing, so this run does not
prove retained-bond reconnection.

## Button-gated monitoring update

Later on 2026-10-25, added `run bluepad monitor` and a firmware start gate. The
firmware waits for a debounced A/B press before starting scanning, publishes a
one-second heartbeat and latches the start-button identity until reboot. This is
a report-only test start, not motor authorization. The monitor records continuously
without a human-response deadline and reports telemetry silence separately from
controller disconnection. Terminal bells are best effort; prompts remain visible.

Validation: 45 CLI tests passed (649 assertions), and both packet and button-gate
C tests passed with ASan/UBSan in Docker. The report-only native build passed its
artifact checks. The button tests cover either/both buttons, bounce, a button held
at boot, repeated presses and clock wraparound.

The updated image was flashed at 06:19:25 UTC, with same-device remount and no
`FAIL.TXT`. HEX SHA-256:
`44d99c78d6f1d56e9731dcb3fc7e68d05a843a8cc271cfe17d804e2bb11e3104`.
The continuous monitor then received repeated `waiting` heartbeats from the
firmware: Bluetooth initialization and the button GPIO setup completed.

The user subsequently pressed A. The capture recorded `BP_START`, successful
encrypted pairing, Microsoft firmware revision `5.23.6.0`, HID setup and incoming
gamepad reports. No typed start confirmation was required. The controller exercise
passed all sampled coverage checks, including return to neutral:

| Control | Observed range / coverage |
| --- | --- |
| Left X | -507 to 511 |
| Left Y | -512 to 485 |
| Right X | -512 to 511 |
| Right Y | -512 to 511 |
| Both triggers | Each reached 1023 |
| Face buttons | A, B, X, Y observed |
| D-pad | All four directions observed |
| Neutral | Last sampled axes 30, 10, -40, 19; triggers/buttons released |

`run bluepad report CAPTURE.jsonl` reproduces the analysis. Coverage uses diagnostic
thresholds (sticks beyond ±400, triggers at least 900, neutral axes within ±64)
and at least 200 ms of neutral snapshots without sample gaps over 500 ms. These
thresholds are not steering calibration. The report resets coverage on an observed
device restart. CLI tests including the report now total 47 passed (654 assertions).
Physical B-button behavior, disconnect/reconnect, bond persistence, radio-loss
timing and the second controller remain untested. Motor code remains absent.

Evidence capture:
`.cache/observations/2026-10-25T06-19-26-805Z-bluepad-session-92525a17.jsonl`.
The live status file is `.cache/observations/bluepad-live.json`; check its timestamp
and `active` field before treating it as current. A heartbeat proves firmware loop
activity, not controller radio freshness. The following records describe the
earlier container integration, before this update.

Validated locally on 2026-10-25. The imported report-only Bluepad32/BTstack/Zephyr
application is experimental; successful compilation and programming do not prove
Bluetooth operation. See the [project workflow](../workspace/projects/bluepad/README.md).

## Reproduction

```sh
run image bluepad
run test
run bluepad test
run build bluepad
run build bluepad --nezha-compile-only
```

- Host CLI tests: 42 passed, 0 failed, 535 assertions.
- Packet tests passed inside the offline container with AddressSanitizer and
  UndefinedBehaviorSanitizer.
- Both native builds passed symbol, unresolved-reference, motor-call and HEX
  address checks. Default firmware has no motor adapter. The optional adapter
  build is a separate compile/link check and cannot be selected by `run flash`.
- Report-only Zephyr memory report: 242240 bytes flash, 36016 bytes RAM.
  These are static build figures, not measured runtime peaks.

The image fetches source and SDK archives using pinned hashes and sizes; its
Debian package manifest is checked against the committed lock. Compilation runs
offline, as the host UID/GID, with read-only source and root filesystem, dropped
capabilities and no hardware or Docker socket mounted. Bun/TypeScript orchestration
and the Docker service remain on the host. Safe-chain protects npm installation
in the existing MakeCode pipeline; it is not a runtime sandbox.

Image ID:
`sha256:23c9d3babae7eed1db1a717bee8b2ef3b6441f086c692bb523be6adf2cf416c4`

Report-only HEX SHA-256:
`edddf4e0787dec9813392edd60d19b82c935b3b3e0166ca4a08645c827410369`

## Programming and remaining hardware checks

With explicit user authorization, `run flash bluepad --confirm` programmed the
attached micro:bit at 2026-10-25 06:10:13 UTC. The same DAPLink device remounted,
and no `FAIL.TXT` was present. The existing MakeCode sources and build artifacts
were retained. No motor commands were issued.

The subsequent ten-second serial capture contained no lines. Startup output may
have preceded opening the capture; this does not establish successful boot or
failure. Boot output, controller pairing, input, disconnect/reconnect and bond
persistence remain to be observed with motors disconnected. Transfer verification
is recorded separately from hardware behavior in the generated flash receipt.

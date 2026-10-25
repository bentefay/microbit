# Bluepad container integration validation

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

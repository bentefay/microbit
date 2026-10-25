# Agent handover

Updated 2026-10-25 after commit `130bab6`. Read this and
[hardware inventory](hardware.md) first. These are versioned project memory;
do not rely on the original chat, ignored caches or an agent's session state.
Update these documents when behavior, hardware or verification changes.

## Current working state

The micro:bit is running **native Bluepad32/BTstack/Zephyr motor-drive firmware**,
not the older MakeCode PS2 program. Implementation is under
`workspace/projects/bluepad/app/`. Its two BLE links connect directly to Xbox
controllers using the micro:bit radio. No ESP32 bridge is part of this setup.

- Bluetooth automatically starts at boot; no front-button start is required.
  Controllers may turn off/on and reconnect independently.
- Each controller connection defaults to **split**: left Y = continuous drive,
  right X = absolute steering position. Xbox **B** toggles only that controller
  to/from either-stick mode. Mode resets to split on reconnect.
- Shared control selects a whole controller's axes from its latest meaningful
  control movement. Either-stick mode also selects a whole stick. Idle jitter
  and stationary deflected sticks must not steal ownership.
- Blue **Xbox A** toggles exclusive override by stable identity, never slot.
  Centred blue input remains neutral during override even if Eli is moving.
  Losing blue during override stops output instead of handing control to Eli;
  the override latch survives its reconnect, but not a micro:bit reboot.
- Initial/recovery arming requires centred sticks. Drive is capped at 20%;
  steering targets are ±45° from captured loose-shaft centre at 15% servo speed.
  Micro:bit **A+B** and I2C faults latch stop until reset.
- Default build is report-only and motor-free. `--motor-drive` explicitly selects
  continuous control; `--motor-bench` is the separate finite four-jog test and
  still requires a front-button press. Do not flash the wrong variant.

Last flashed motor-drive HEX SHA-256:
`56916a7530cce7c0113ad427ed49da7c8443df31b6be642d2511d83ce396d605`.
Flashed 2026-10-25 08:18:04 UTC; same-device DAPLink remount, no `FAIL.TXT`.
Both controllers then reported connected, split mode and start-button mask zero;
blue input produced active motor commands with I2C result zero. Last implementation
checks: 58 CLI tests / 727 assertions, seven native C suites with ASan/UBSan,
motor-drive and report-only builds passed.

## What is already tested

Ben confirmed responsive/correct LED direction, both controllers together,
independent and both-off reconnection, blue A override, both motors moving both
directions, and corrected held continuous drive/position steering with either
stick. B toggles were observed in hardware telemetry (split/either/split).
Automatic connection and both split defaults were observed after the latest flash.
Do not repeat those full test sequences for documentation or unrelated changes.
Telemetry verifies inputs and commands; it is not visual proof of physical motion
or an end-to-end latency measurement. No loaded chassis test has been recorded.

## Important implementation details and past failures

- `platform.c`: Bluetooth startup, serialized discovery/setup for the upstream
  Device Information Service singleton, two live links, input dispatch, telemetry
  and peer-liveness probes. Keep the setup serialization when changing connection code.
- `display_owner.h` / `controller_roles.h`: shared ownership, per-pad mapping,
  held-button edge detection and blue identity. Held A/B on first report is ignored
  until release and a fresh press. `display_join_mode(..., true)` sets drive's
  split default; LED-only variants retain their left-stick diagnostic mapping.
- `motor_control.h`: pure planner and command suppression; `motor_drive.c`:
  dedicated I2C worker, latest snapshot rather than a queue, 10 ms loop, drive
  written before steering. Continuous M1 uses `0x60` / stop `0x5f`, not repeated
  incremental moves. M2 uses absolute `0x5d`, shortest-path mode, with required
  4 ms bus settling. No optional vendor 500 ms motion wait is used.
- Xbox notifications may stop while a stick is held steady. **Do not use HID
  GET_REPORT as fresh control input**: these controllers returned a neutral
  template and caused the earlier half-second drive interruption and steering
  return. That was fixed and physically verified.
- After 150 ms quiet, selected-owner liveness uses a GATT read of HID Information
  UUID `0x2a4a`. Only an actual peer response refreshes liveness; it never replaces
  axes/buttons. Sending a request, receiver readiness or the other controller's
  reports are not evidence of that owner's radio connection. No reply/input for
  over 500 ms stops output; moving stale input must re-centre before resuming.
- Steering centre is captured once on startup. There is no automatic chassis
  homing, measured linkage calibration or encoder polling in the control loop.
- PS2 vendor readiness loops have no timeout. Keep them out of timing-critical
  code. The old PS2 lag/hang investigation remains unresolved; do not call it fixed.
- An initially slower second-controller report cadence improved on reconnection.
  Cause remains unknown; cadence alone is not physical latency.

## Tooling and continuation

Use `run` under direnv, or `cli/bin/run` directly. Host orchestration and diagnostics
belong in the TypeScript CLI. Downloads, pinned SDK/source installation and native
builds run inside Docker; builds are offline and never flash. The Bun CLI, Docker
service and host USB stack remain on the host. Safe-chain wraps npm installation
inside the MakeCode image; it is not a runtime sandbox around Bun. No ad hoc
downloaded helpers, host package installs or temporary diagnostic scripts.

```sh
cli/bin/run device
cli/bin/run test
cli/bin/run bluepad test
cli/bin/run build bluepad --motor-drive
# Separate operation; only with applicable flashing authorization:
cli/bin/run flash bluepad --motor-drive --confirm
cli/bin/run bluepad monitor
```

For a fresh toolchain, `cli/bin/run image bluepad` downloads/builds pinned tooling
in Docker. Pins are under `toolchain/bluepad/`; see the
[native README](../workspace/projects/bluepad/README.md). Use checked-in inspection
commands (`bluepad inspect`, `inspect`) rather than host vendor-code execution.

Before flashing, stop any existing repo-scoped capture with
`cli/bin/run bluepad monitor-stop`, then restart it afterward. Never assume a
previous process/session ID still exists. Monitor writes
`.cache/observations/bluepad-live.json` and timestamped `*bluepad-session*.jsonl`.
Check `updated`, `active` and device heartbeat before claiming live readiness.
`bluepad dual-report FILE`, `bluepad report FILE` and `bluepad timing FILE` analyze
saved captures. `BP_STATUS` button mask zero means automatic startup, not A+B.
`BP_MODE` records per-pad modes; `BP_PRIORITY` override; `BP_POLL` actual responses;
`BP_DRIVE` commands, state, I2C errors and liveness age.

All `.cache/` logs and `built/` artifacts are ignored and may be absent on a fresh
clone. Durable evidence is summarized in [validation](bluepad-container-validation.md).
Do not depend on the earlier Downloads investigation directory; the path supplied
in the chat was unavailable when this handover was written.

Build receipts hash the entire native project (including its README and tests),
toolchain files and `cli/bluepad.ts`. Finish those edits **before** building;
otherwise flash correctly rejects the stale artifact. Root docs can be updated
with test results afterward. Keep variants and receipts separate. Reboots have
passed saved-bond recovery; do not promise that every DAPLink reflash preserves bonds.

## Working with Ben

Ben wants implementation completed with as little repeated hands-on testing or
chat confirmation as possible. Prepare code, automated checks, authorized flash
and fresh monitoring before requesting a physical action. Inspect captures first:
he may already have performed the action before replying. Bundle any required
actions into one concise cue, and ask only for visual facts telemetry cannot show.
Current firmware auto-connects; do not ask for micro:bit A/B to start ordinary use.
Use the [runsheet](xbox-bench-runsheet.md) for test history and minimal-input practice.

Earlier authorization covered flashing and the confirmed loose-motor bench.
Physical state may change; do not treat that as authorization for unmeasured
chassis movement. A running recorder can outlive a turn, but does not make an
idle assistant actively supervise hardware or automatically resume.

The GitHub remote is `git@github.com:bentefay/microbit.git`, branch `main`.
Ben explicitly requested commit and push for this handover, including the existing
local implementation commits. Future pushes still require an applicable user
request; never force-push or create a remote repository automatically.

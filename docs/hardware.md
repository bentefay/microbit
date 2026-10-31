# Hardware inventory

Last reconciled: 2026-10-31 (firmware capabilities; no new physical inspection).
This is the inventory of hardware confirmed in this
project, not a complete bill of materials for a finished car. The current setup
is a loose-motor bench. See [agent handover](agent-handover.md) for software state.

## Boards, motors and connections

| Hardware | Quantity | Confirmed details and role |
| --- | --- | --- |
| BBC micro:bit V2.2 | 1 | Bought from ELECFREAKS; runs the native Xbox firmware, Bluetooth radio and 5×5 LED display. Front buttons A/B; A+B requests a latched motor stop. |
| ELECFREAKS Nezha Pro expansion board | 1 | Rechargeable battery, motor controller and power switch. Micro:bit fitted to the board. USB-C is for charging. |
| PlanetX Smart Brick Motor | 2 | LEGO-compatible motors with position feedback. M1 is intended propulsion; M2 is intended steering. Both are currently loose, with free shafts. Individual motor serials/SKUs have not been recorded. |
| Microsoft Xbox wireless controllers | 2 | BLE connections directly to the micro:bit; identities and roles below. No external Bluetooth bridge is used. |
| PlanetX PS2 Joystick Kit | 1 kit | Original wireless gamepad plus receiver/adapter. Replaced by Xbox for current control because of unreliable/slow input. Retained for historical investigation. |
| RJ11 4P4C cables | Count not recorded | Nezha peripheral connections. |
| Micro-USB data cable | 1 confirmed in use | Host to micro:bit for DAPLink flashing and serial telemetry. USB data operation verified. |
| Micro:bit case | 1 recorded | Accessory; installation state not recorded. |
| Linux development computer | 1 | Runs Bun CLI and Docker; exact computer model not recorded. Repo location on Ben's machine: `/home/ben/Code/microbit`. |

Current functional wiring:

- M1 → propulsion motor; M2 → steering motor. This is one drive motor plus one
  steering motor, not two-wheel differential/tank steering.
- Micro:bit communicates with the Nezha motor controller through external I2C
  P19/P20, address `0x10` (Zephyr `i2c1`).
- Xbox controllers → micro:bit over BLE; no PS2 receiver is required by native firmware.
- The PS2 receiver's last confirmed connection was Nezha **IIC**, never M1–M4.
  Its current physical attachment has not been rechecked; native firmware does
  not read it.
- Program through the micro:bit's **micro-USB**, not the Nezha's charging USB-C.

Observed micro:bit DAPLink USB serial:
`9906360200052820809ef4f6a09908bb000000006e052820`.
Use `cli/bin/run device` to rediscover its current mount and serial path; those
paths are not fixed identifiers.

## Xbox identities

| Controller | Owner/role | Stable BLE address | Reported device serial | Observed firmware |
| --- | --- | --- | --- | --- |
| Blue; paired second | Ben / parent override | `5C:BA:37:DD:D9:6C` | `02VO0088623747` | `5.23.6.0` |
| Gray and orange; paired first | Eli / shared control | `5C:BA:37:67:7F:DA` | `02CN0005366716` | `5.23.6.0` |

Ben updated both controllers and reported the updater offered no newer version at
that time. The version above was subsequently read from the devices; it is not a
claim about the latest version available today. Exact retail model numbers are
not recorded. Do not infer identities from connection order, slot 0/1 or serial
capture filenames: slots can swap. The blue address is encoded in
[`controller_roles.h`](../workspace/projects/bluepad/app/controller_roles.h).

Both can stay connected simultaneously and reconnect after independent power
cycles. Each connection starts in split mode: left Y drives, right X steers.
Xbox B toggles that controller's split/either-stick mapping. Blue Xbox A toggles
exclusive override; with override off, latest meaningful control movement from
either controller selects the owner of both motor axes. An override-on blue
disconnect does not hand control to Eli. Micro:bit reset clears override.

## Physical state and limits

Ben confirmed the loose motors were secured, clear of hands/objects, with the
Nezha power switch accessible. Both motors moved both ways in the finite bench
test. Corrected continuous drive, position steering and either-stick controls
were physically confirmed working. This describes the recorded bench, not a
guarantee that a later session still has the same physical setup.

Native motor-drive defaults to M1 ±20% continuous speed and M2 ±45° around its startup
encoder position, at 15% positioning speed. Either controller's settings can change
the drive cap to 5–100%, centre in 2° steps and travel to ±5–360° in 5° steps.
The wider range requested by Ben uses measured encoder travel and short position
waypoints; full left to right at maximum is two turns. These are loose-shaft bench limits,
not measured steering-linkage limits. Both sticks must be centred before initial
arming. The LED shows the selected drive/steering input, not measured motor position.

No assembled chassis, wheel sizes, gearing, steering linkage, loaded direction,
steering travel or vehicle weight have been documented. Measure linkage centre
and limits before chassis operation; do not discover limits by forcing stops.

The built-in speaker is now driven on P0.00 with nrfx PWM1 at 16 kHz for settings
speech/tones; the LED matrix keeps PWM0/TIMER4. The editing Xbox receives finite BLE
rumble feedback. Audible/visible/tactile operation still needs physical testing.
While settings are open, the matrix shows scrolling names then a coarse value
bar; ordinary input display returns on exit. No additional wiring is required.

Raw M2 command-0x46 boot readings are now logged as `BP_ENCODER`. Whether the
encoder reference survives power loss remains unknown. Saved centre currently
means an offset from that boot reading, so park centred before power-off. The
pending bench test is: note raw reading, fully remove power (including USB), turn
unpowered M2 about 90° by hand, restore power and compare. No physical result is
inferred from telemetry or source research. See [settings mode](settings-mode.md).

2026-10-31 settings-flash observation: USB/DAPLink and firmware heartbeats respond,
but motor initialization returns I2C `-5`; no raw encoder capture is available.
This is an unavailable endpoint indication, not proof of the Nezha power-switch
position or motor wiring. Check Nezha power and micro:bit seating, then reset the
micro:bit to clear the latched fault before using the settings feature.

Later on 2026-10-31, Ben confirmed fitting the micro:bit to Nezha. The 10:13 UTC
capture shows I2C result 0, boot encoder raw 0 and both controllers connected;
the earlier unavailable-endpoint fault is resolved. Accepted speed was 100%,
centre 0°, range ±45° (defaults remain 20%/±45°). Ben reported that the text
scrolls but is too fast and that the speaker is silent. Software investigation
found the audio request purging its waiting reader, terminating the audio worker.
The follow-up fixes that worker, halves scroll speed and lets either controller
open settings. Audible speech/tones still need confirmation after the fix.

The follow-up flash at 10:19:46 UTC booted with I2C 0, raw encoder 5 tenths,
M1 stopped awaiting input and defaults 20% / centre 0° / ±45°. The earlier 100%
setting was not retained across this DAPLink flash. Audio initialized successfully;
no playback was requested in the initial observation. This reboot is not the
unpowered hand-turn encoder test and does not establish its reference semantics.

Ben subsequently heard a tone and saw edits revert while repeatedly adjusting
centre. The capture shows two controller MIC-failure disconnects (0x3d), with
continuous micro:bit uptime; each cancels the unsaved editor session and plays
the falling tone. No changed-value save/store preceded either event. A global
audio interrupt mask was found and removed; physical repeated-input verification
is still needed. Ben requested the new ±360° range; its actual multi-turn travel
and raw encoder continuity remain unverified on this bench.

10:29:17 UTC follow-up flash succeeded. Fresh monitoring after 10:29:20 shows
Eli reconnected, I2C 0 during repeated encoder polling, raw boot and current path
position 0, defaults 20% / centre 0° / ±45°. Awaiting first input in that initial
capture; no physical multi-turn sweep or repeated-adjustment check inferred.

Evidence and historical results are in [container validation](bluepad-container-validation.md),
[bench runsheet](xbox-bench-runsheet.md) and [PS2 investigation](receiver-investigation.md).

# Hardware inventory

Last reconciled: 2026-10-25. This is the inventory of hardware confirmed in this
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

Native motor-drive uses M1 ±20% continuous speed and M2 ±45° around its startup
encoder position, at 15% positioning speed. These are loose-shaft bench limits,
not measured steering-linkage limits. Both sticks must be centred before initial
arming. The LED shows the selected drive/steering input, not measured motor position.

No assembled chassis, wheel sizes, gearing, steering linkage, loaded direction,
steering travel or vehicle weight have been documented. Measure linkage centre
and limits before chassis operation; do not discover limits by forcing stops.

Evidence and historical results are in [container validation](bluepad-container-validation.md),
[bench runsheet](xbox-bench-runsheet.md) and [PS2 investigation](receiver-investigation.md).

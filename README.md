# Ben and Eli's micro:bit workshop

A reusable Linux workspace: Bun/TypeScript `run` CLI, a Nix/devenv shell,
containerized MakeCode/PXT and native ARM compiler, and projects under
`workspace/projects/`. The first project is `car`. This repository has no GitHub
remote; Ben will publish it.

## Hardware and current state

| Item | Details |
| --- | --- |
| Expansion board | ELECFREAKS **Nezha Pro**, with rechargeable battery |
| Computer | BBC **micro:bit V2.2**, bought from ELECFREAKS |
| Motors | Two PlanetX **Smart Brick Motors**, LEGO-compatible with feedback |
| Remote | PlanetX **PS2 Joystick Kit**, physical wireless gamepad and receiver/adapter |
| Accessories | RJ11 4P4C cables, micro:bit case, micro-USB cable |

The Nezha's onboard buttons have run both motors in both directions. They work
independently of a micro:bit program. Both loose motors have also passed finite
20-degree movement and stopping tests from micro:bit firmware, in both directions.
The micro:bit enumerates over USB, confirming that the connected cable carries
data. Use its **micro-USB** socket for programming; Nezha's USB-C is for charging.

The receiver was initially connected to a motor port; Ben subsequently confirmed
it is connected to **IIC**, and inputs have been logged. Do not connect it to M1–M4.

The current loose-motor bench wiring is M1 = intended wheel drive, M2 = intended
steering, and receiver = IIC. This is **one drive motor plus one steering motor**,
not tank steering.
Chassis, wheels, gearing, linkage, center, travel, direction and weight are unknown.
Never find steering limits by driving into a mechanical stop.

## Controls and firmware status

The Xbox mapping is the same on **both sticks: up/down = proportional drive,
left/right = steering position**. The most recently moved stick controls both
axes; the LED dot follows it. Centring it stops drive and returns steering to its
centre. Blue Xbox A toggles exclusive control over Eli's controller.
Xbox **B toggles that controller to split controls** (left stick speed, right
stick steering), then back to either-stick mode. Each connection starts in
either-stick mode; the other controller's choice is independent.

**Currently flashed (2026-10-25): experimental Bluepad32 Xbox loose-motor control.**
Either front micro:bit button starts scanning and initializes stopped outputs.
Centred sticks enable continuous M1 drive from Y (20% cap) and M2 position
from X (±45° around its captured loose-shaft centre, at 15% servo speed).
Blue Xbox A toggles exclusive control. A+B on the micro:bit latches a stop.
This is the explicit `--motor-drive` variant; default report-only remains motor-free.
Both loose motors already passed finite movement in both directions on the native
bench. Ben confirmed the corrected continuous drive, steering and either-stick
controls work perfectly; the newly added B mode toggle awaits its physical check.
Container builds, DAPLink transfer and live firmware readiness heartbeat passed.
A physical A-button start, Xbox pairing, control coverage and sampled neutral return
have passed. Controller power-cycle recovery and saved-pairing recovery after a
micro:bit restart also passed. See
[container validation](docs/bluepad-container-validation.md).
Both Xbox controllers passed input checks and retain their saved pairings across
restart. The latest diagnostic supports two concurrent controllers, with left-stick
movement selecting which controls the matrix. Both simultaneous control and
independent off/on recovery have passed physical testing, including recovery after
both controllers are switched off together.
On the blue Xbox controller, **A toggles exclusive override**. Override off keeps
the shared latest-movement behavior; override on accepts only blue input. The role
follows blue's saved Bluetooth identity, not connection order. If blue disconnects
during override, the matrix clears until it returns; a board reset starts shared
mode. This update is flashed and passed automated tests and the physical override
toggle/shared-control check, confirmed by Ben. The new motor-control variant applies
the same controller ownership to both motors; either stick can select the shared owner.
A slower initial report cadence on the
second improved after normal reconnection; its cause is still under investigation.
The Xbox diagnostic now includes left-stick LED feedback. Physical sessions follow
the [minimal-input bench runsheet](docs/xbox-bench-runsheet.md).

The MakeCode `car` project still selects the motor-stopped receiver investigation,
described in [docs/receiver-investigation.md](docs/receiver-investigation.md).
The PS2 input-lag cause is unresolved; no timing workaround has been declared a fix.

The normal program is **`car.startDriving()`**, in `drive.ts`.
This older MakeCode program retains the previous split-stick mapping; the current
native Xbox firmware uses either stick for both axes as described above.
`run car-mode drive` selects it; `run car-mode receiver-lab` selects the investigation.
Selection changes `main.ts` and its block only; build and flash remain separate commands.
Settings are in `settings.ts`; diagnostic programs remain separately selectable.
The current configuration is for the existing loose motors. Before attaching a
steering linkage, enter measured limits and switch off `looseMotorBench`.

- Startup: small square, automatic receiver polling, no motor movement until
  three centered-stick samples. No button presses are needed. The current M2
  encoder position becomes the loose-motor bench center. The LED joystick display
  then replaces the startup square; diagnostics report when control becomes active.
- Left Y controls continuous signed M1 speed, capped at 20 percent. Speed commands
  are sent only when demand changes; centering the stick sends a stop. Physical
  speed linearity has not yet been measured.
- Right X selects M2 position within ±45 degrees of the captured center, returning
  toward center when released. This is a loose-shaft sweep, not a measured linkage
  limit. The vendor's shortest-path absolute positioning wraps modulo 360. Targets
  update only on change, with no repeated stops. Angular-movement speed is 15 percent.
- **A selects the left-stick display; B selects the right-stick display.** A is
  left and B is right when facing the LED matrix. Display selection does not change
  motor control or arming. Use Nezha power-off to stop the motors.
- A read failure shows X and stops polling. Restart to retry with centered sticks.
  Receiver readiness still does not prove fresh radio data. Repeated stale values
  can sustain drive demand, so this is not a radio-loss failsafe.

At Ben's request, continuous drive replaces the earlier finite-angle pulse test.
**A native I2C stall can now leave the drive motor running until Nezha power-off.**
Stops are requested on startup (Nezha may retain motion across micro:bit resets)
and when a failed receiver read returns, but blocked I2C can prevent those commands.
The active loop yields for 20 ms, plus MakeCode scheduling and I2C time. Continuous
drive has its own per-motor speed command; the angular-movement speed setting is
set once for steering instead of following throttle. Settings, axis inversions and
the provisional eight-count dead zone are in `settings.ts`. Chassis mode refuses
to operate without an explicit calibration flag and valid measured limits, with
the center between the endpoints and less than 180 degrees total shaft travel.
Measured coordinates may cross zero using unwrapped values; no homing is performed.

### Joystick LED display

`displayStyle` selects one of three renderers. A/B select the stick; motor axes are
read and commanded first, followed by the selected stick's other axis for display.
Thus the display adds one receiver-axis read per cycle, not a second full control loop.
LX and RY orientation uses conventional defaults and still needs hardware confirmation;
their display inversion flags are independent of motor inversion. The display uses
the same configurable dead zone as control and does not suppress intermittent neutral
readings. The last latency capture contained several brief 128 readings while Ben
reported holding a direction; the cause remains unresolved.

Ben selected the blended moving-dot view as the default. The consolidated program
passed 31 host tests, offline PXT compilation, the blocks/TypeScript browser
round-trip, and flashing with no DAPLink error. The `final-car-display` capture
confirmed active operation and changing inputs, with sampled maximum cycle times
around 68–72 ms. Visual orientation of both sticks and physical steering calibration
still require confirmation; serial output alone does not verify motor behavior.

- `0` (default): a bright dot represents direction and deflection on the full 5×5
  matrix, blending neighboring LEDs for intermediate positions. There is no fixed
  center light; the center lights only when included in the joystick dot. No separate
  radius scale is needed.
- `1`: Ben's coarse/fine polar encoding. Outer-ring direction uses 16 positions;
  the eight-position inner pointer rotates nine times per joystick revolution.
  Both pointers and the center align at every cardinal and diagonal direction.
  A brightness-pulsing marker in the rightmost column encodes radius in five levels,
  bottom zero/top full. Pulsing distinguishes it where it overlaps the direction
  pointer, which stays lit. At zero radius the direction is undefined and pointers
  park upward. This is a visual angle code, not an eight-bit numerical readout.
- `2`: aligned polar pointers with brightness proportional to deflection. Only the
  center remains lit at neutral; no separate right-column scale is used.

Run `run display-preview` to generate `workspace/built/joystick-display.html`.
Open it locally for an interactive comparison using the actual firmware frame
renderer. It is self-contained, uses no network or hardware access, and is regenerated
from checked-in TypeScript. The renderer and its compass alignments are tested.

Normal-mode diagnostics emit one `CAR_STATE` CSV line per second: state (0 waiting,
1 active), selected stick (0 left, 1 right), raw LY, raw RX, selected extra axis,
last drive percent, steering target, maximum cycle interval and maximum individual
read-group time in milliseconds. These measure software timing, not radio sample
age or physical input-to-motion latency. `serialDiagnostics=false` disables routine
telemetry. `run serial 300 controller-timing` captures five minutes (1–600 supported).
Use `run joystick-report PATH.jsonl` to summarize selected-stick ranges, exact
center samples, normalized radius and recorded timing maxima from these snapshots.

In the 30-second `left-stick-circle` capture, Ben was instructed to circle the left
stick at full deflection until told to stop. All 29 snapshots selected the left
stick. Both axes reached 0 and 255. At 24.509 and 29.690 seconds both axes reported
exactly 128 (center); at 20.378 seconds X=128/Y=208 gave normalized radius 0.630.
These readings are inconsistent with a continuously full-deflection circular
output, but do not isolate the gamepad, radio link, receiver, or I2C protocol.
Reported loop maxima were 68–72 ms and read maxima 14–16 ms. Sparse ~1 Hz snapshots
cannot determine the duration or frequency of brief dropouts or measure physical
input latency. The firmware was not changed for this capture.

### Guided latency measurement

Select `car.startLatencyTest()` in `main.ts` (or the matching startup block).
Build and flash through the usual CLI. After centered-stick startup, it shows L
then an up arrow and waits indefinitely. The first LEFT-stick forward movement
starts a warm-up trial (readiness time is excluded). Seven further alternating
down/up cues follow 3–4.5 seconds apart. Respond with the LEFT stick as soon as possible and hold that
direction until the next arrow. M1 follows the actual stick, at the same 20 percent
cap; M2 stays stopped. Both motors receive stops after the eighth trial. Start a
fresh capture and restart to repeat. Return the startup call/block to
`car.startDriving()` afterward; normal driving still needs no button.

Capture with `run serial 120 latency-cues`, then run
`run latency-report .cache/observations/FILE.jsonl`. Firmware records cue time,
left-input receipt, drive-command return, and timestamped M1 encoder samples.
The report separates cue-to-input (human reaction PLUS controller/receiver delay),
input-to-command, and an interval containing the first observed encoder movement
or reversal. Two successive moving samples confirm direction. Pre-positioned
sticks, missing responses, absent moving baselines, and implausible encoder jumps
are flagged rather than counted as reliable latency results. The native read API
does not expose I2C read errors, so plausible but invalid encoder data cannot be
fully ruled out. Reported positions also have their own update rate; this measures
encoder-observed response, not exact physical onset. Extra encoder reads and serial
logging add diagnostic overhead, so compare this with the normal-mode timing.

The retained `startControllerBench` diagnostic and the guided test accumulate
maximum cycle/read/command durations over each reporting window. The old bench
diagnostic has a top/bottom/center drive indicator; the consolidated program uses
the selected joystick visualization, and the guided test reserves LEDs for cues.
Serial logging follows motor
commands rather than delaying their dispatch. The guided mode retains the same
native-I2C-stall limitation as continuous driving; its automatic end cannot stop
motors if execution has stalled before reaching the stop commands.

For input-only diagnostics, change the startup call/block back to
`car.startCommissioning()`: A displays ELI, B shows a tick, and A+B toggles logging.
That mode makes no motor commands and latches read failures until manual retry.
Firmware compilation, successful USB transfer and observed hardware response are
separate checks. The first controller-bench image panicked with 980 on startup.
Generated ARM code showed the nested `stopOutputs` declaration being called through
an out-of-scope stack slot in the forever callback. Changing it to a function-valued
local makes the compiler capture it in the closure instead (verified in assembly).
Host tests did not expose this native compiler behavior. Ben subsequently confirmed
the corrected firmware mostly works with the controller, establishing recovery from
the startup panic. He reported approximately 500 ms perceived input-to-motion delay
and alternating steering movement on repeated left taps. Timing and held-stick
behavior are under investigation; integrated control is not yet fully validated.
Ben then confirmed automatic startup worked well, but still perceived around
500 ms delay and requested continuous drive. The preceding `controller-timing`
capture measured mostly 140 ms cycles, roughly 10 ms receiver reads and 7–8 ms
motor commands. Those are software timings, not an explanation of all perceived
latency. The continuous-drive version reduces pauses and removes repeated stops.
The `continuous-drive` capture shows initial cycle samples of 56–72 ms, receiver
reads around 10–15 ms, and 0 ms spent commanding motors on unchanged-demand cycles.
Zero command time does not mean a motor stopped: Nezha retains the last command.
Ben confirmed continuous movement felt better, but reported intermittent 500–1000 ms
delay and unexpected switching. In the `latency-joystick-start` capture, trials 3–8
were captured completely: cue-to-input was 345–925 ms, input-to-command 10 ms, and
encoder-observed reversal intervals fell within 0–104 ms. The recorded maximum
cycle interval was 108 ms, maximum receiver read 16 ms, and motor command 1 ms.
The first interval includes human reaction and receiver/radio behavior; it does not
prove that the controller alone adds 200–700 ms. Several short raw-neutral readings
interrupted held-direction commands. Ben confirmed following the instructions;
the cause of these readings is unresolved. A later unplug/replug was reported,
but which connection and whether it affected that run were not established.

Verified on this machine: offline CLI builds of `blink` and `car`, native ARM
compilation in Docker, a successful USB flash/remount, and Ben's observation of
the tick and button A scrolling **ELI**. An isolated Chromium test also loaded
the repository project, converted its custom block to TypeScript and back, and
compiled it to HEX using the local native cache. Serial opening/closing was
tested. After the startup fix, the bench block also passed the isolated Chromium
round-trip and browser compilation using the local native cache.
Live controller and individual motor observations are recorded below.

Before chassis operation we need measured steering center/travel/direction, a native
I2C timing fix, and further loss-of-control tests. Loose-motor tests do not replace
those checks. Speed percentages are **not** an independently adjustable torque limit.

## Normal workflow

The experimental direct Xbox Bluetooth port has a separate container workflow:
`run image bluepad`, `run build bluepad`, and `run bluepad test`.
Dependency downloads and all native tools run inside Docker; firmware builds are
offline and never flash. See [the Bluepad project](workspace/projects/bluepad/README.md)
for isolation, dependency locks, output checks and explicit programming commands.

```sh
cd ~/Code/microbit
direnv allow
run doctor
run image build         # npm ci via safe-chain; ARM compiler installed inside image
run build blink         # network-disabled container, including native compilation
run build car
run test
run serve
run logs               # local editor URL/token
run stop
run device             # read-only USB/mount verification
run flash car --confirm
run serial 10
```

`run serial 60 LABEL` reads the verified micro:bit serial device inside Docker.
The TypeScript CLI saves every complete line with a host receipt timestamp to
an ignored `.cache/observations/*.jsonl` file, prints changed axis values, and
summarizes counts/ranges/readiness failures. These timestamps cannot establish
fresh radio packets. Capture files are local and are not committed.

`run deps lock` deliberately updates the npm lock through safe-chain; `run native
lock` resolves native release commits; `run env lock` updates the Nix lock through devenv. Dependencies are never installed
implicitly when entering the shell. The host CLI has no third-party JS packages;
Bun executes it directly. npm inside the image is wrapped with pinned safe-chain;
package lifecycle scripts are disabled. Python is used by the native CODAL build
inside Docker; there is no host pip installation.

Create another project with `run new NAME`. Use `run build NAME` and `run flash
NAME --confirm`. Builds never flash automatically. Firmware lives in ordinary
files, so VS Code outside Docker edits the same mounted workspace. The VS Code
build task invokes PXT and reports compiler errors. Ordinary TypeScript editor
diagnostics do not implement MakeCode's Static TypeScript subset.

The editor listens only on localhost ports 3232/3233. Open the **Shared-files
editor** URL printed by `run logs`: it uses `/index.html?ws=fs#local_token=…`.
The explicit page matters: PXT's root redirect drops the filesystem query.
Browser-local projects are a different storage location. Avoid simultaneous
unsaved edits in VS Code and the browser; reopen/reload after external changes.
MakeCode's Time Machine is disabled (`disableHistory`) because its history
writes conflict with this filesystem backend; use Git for history.
`main.ts` is kept small and block-friendly, while helper code lives in other files.
Arbitrary TypeScript is not guaranteed to round-trip to blocks. The checked-in
custom startup block is the round-trip case covered by `run editor-test`. Rebuild
the browser image (`run image browser`) after changing its checked-in test script.

## Isolation and dependencies

Only `workspace/` is mounted into compiler/editor containers. They run as your UID
with capabilities dropped, no privilege escalation, resource limits, and no host
home, Docker socket or raw USB access. Docker and Nix themselves are host tools;
cgroups are resource controls, not a complete security boundary. Browser-side
editor/simulator code executes in your host browser.

The flash container gets the built-artifact directory read-only and only the
verified mounted MICROBIT drive writable, without network. The CLI correlates
the VFAT mount through sysfs with the micro:bit USB device, validates Intel HEX
checksums, copies/syncs the artifact, and checks for DAPLink's FAIL.TXT. It does
not pass the whole USB bus or a block device into Docker. The host kernel still
enumerates and mounts USB: this design cannot isolate a malicious USB device from
the host's USB stack.

`toolchain/versions.json` records the base image digest and vendor source commits;
`toolchain/package-lock.json` locks the JavaScript graph. Main versions are
PXT launcher 0.5.1, micro:bit target 9.1.1, PXT core 13.0.1 and safe-chain 1.5.10.
Builds target micro:bit **V2** and avoid the old V1/yotta toolchain. Building
the image requires network access; `run build` has Docker network disabled, so a missing
dependency fails rather than silently compiling in the cloud.

The ARM compiler and C/C++ standard libraries come from Debian's signed APT
repositories during `docker build`: `gcc-arm-none-eabi`,
`libnewlib-arm-none-eabi` and `libstdc++-arm-none-eabi-newlib`. They are installed
inside the image (compiler under `/usr/bin`, target libraries under
`/usr/lib/arm-none-eabi`), stored in Docker's image layers, and reused from its
build cache. These downloads do **not** go through safe-chain. CODAL runtime
sources are fetched from GitHub at pinned commits into `/opt/native` in the
image, then copied into each project's ignored `built/codal/` directory to build.

The pinned ELECFREAKS packages are bundled into the target in the image. Project
dependency values `"*"` select those bundled versions, without querying GitHub.
The ignored `workspace/vendor/` copy is for inspection; editing it does not
change the bundled dependencies. Change the source pins and rebuild the image
to update them.

Native Git commits are in `toolchain/native-lock.json`, including the three
transitive CODAL libraries from its release lockfile. `system-lock.json` records
the Debian package versions and image construction checks for drift. This detects
repository changes; it is not an archive of Debian's package files. A fresh build
can fail if Debian changes or removes those versions.

`run image browser` builds the optional Chromium test image; `run editor-test`
exercises the local editor. This browser is also in Docker. The editor container
uses an internal network, and a Content Security Policy restricts the host
browser's editor page to local resources. Cloud sign-in, external documentation
and online extension browsing are unavailable in this workflow.

CLI compilation and native C++ compilation run inside Docker. The interactive
editor compiles Static TypeScript in the browser and uses native cache entries
created by `run build PROJECT` in `workspace/built/hexcache/`. If a native cache
entry is missing, build that project with the CLI, then retry in the editor;
cloud fallback is blocked. Ordinary TypeScript-only edits can reuse the same
native cache. Restart the editor after replacing its toolchain image.

Safe-chain checks npm packages; it is not a proof of safety and does not audit
the vendor firmware, native Git repositories or Debian packages. Those are
separate dependencies. No credentials are mounted into the images.

## Vendor implementation findings

The pinned motor implementation is `elecfreaks/pxt-nezha2`, namespace `nezhaV2`
with enum spelling `MotorPostion`. Its README has stale examples. Motor start
accepts signed speed percentages. Absolute angles wrap modulo 360, and movement
APIs include delays; these semantics must be accounted for in steering control.
`comboStart` is for paired drive wheels and is inappropriate for this car.

The pinned `elecfreaks/pxt-PlanetX` package contains native C++ and depends on
`pxt-PlanetX-AI`. Its physical PS2 APIs are `PlanetX_Basic.GetAnalogValue` and
`get_Attention_Value`; deprecated joystick APIs refer to other hardware. Both
PS2 reads busy-wait for readiness byte 0x10 from I2C address 0x08, without timeout.
An outer timeout cannot interrupt those calls. `receiver.ts` is a small adaptation
for commissioning: at most 16 readiness attempts or 20 ms elapsed, with a yielding
pause between attempts, returning -1 on timeout. It reports raw bytes rather
than the vendor's adjusted values. The loop has unit tests and compiles under
PXT, but individual runtime I2C calls are not interruptible by this timeout;
real hardware timing remains unverified. It does not establish radio freshness.

Receiver readiness does not prove fresh radio data. The exposed protocol does
not establish a disconnect indication. Stale buttons can defeat a held-enable
scheme. **Reliable radio-loss stopping is not verified** and may be impossible
with this receiver API. Do not claim otherwise from a readiness timeout.

## Bench checklist

### Observations — 2026-10-23

- Ben confirmed both motor cables disconnected, receiver in a labelled IIC
  port, and Nezha/controller powered. Micro:bit remained seated with USB attached.
  Live serial reads worked in that arrangement; this observation is not an
  electrical verification of the board's simultaneous-power protection.
- Left-Y sequence (forward, center, backward): 0, 128, 255, with intermediate
  readings during partial movement. Forward therefore needs axis inversion
  when positive output means forward. The initial capture is in the session
  transcript, before file logging was added.
- Right-X sequence (left, center, right): 0, 128, 255, with intermediate values.
  The saved `right-stick` capture contains 450 right-axis and 449 left-axis
  samples, zero readiness failures, and the untouched left axis at 128.
- These are initial endpoint/center observations, with direction inferred from
  the instructed movement order. Dead zones, general radio-loss behavior, motor direction
  and mechanical steering limits still require testing. Occasional 128 readings
  appeared between endpoint readings; verify steady holds before filtering them
  or attributing them to the controller or receiver.
- Controller power-off test: Ben held left-Y fully forward while switching the
  controller off, then released it. The `controller-off` capture showed 0 while
  held, then 128 from 37.3 seconds through the end of the 60-second capture.
  Right-X stayed 128; neither axis reported a readiness failure. This supports
  neutral-on-power-off for this trial, but the precise physical switch time was
  not instrumented, so no stop-latency bound is established. Sleep, interference,
  button-state release and general radio-loss behavior remain unverified.
- Receiver-disconnection trial exposed a failure: both axes returned -1 from
  29.9 to 40.5 seconds in `receiver-disconnect`, then **all serial output stopped**
  around reconnection. A subsequent 60-second `reconnect` capture was empty,
  and Ben reported no button B response. A brief reset press did not restore
  display/button behavior. This does not establish reliable receiver recovery or
  justify chassis operation. The first loose-motor test used finite requests;
  the current continuous-drive bench has the additional limitation described above.
- A full power cycle (Nezha off and micro:bit USB disconnected) restored the
  tick and button A display. Diagnostic firmware now stops polling after the
  first failed read and requires a manual retry; this avoids continued polling
  across a known disconnection, but does not fix or bound the native I2C call.
- The updated diagnostic passed the unplug stage: `fault-stop-check` logged
  a failed read at 45.4 seconds, the polling-stopped message at 46.0 seconds,
  and continued fault-state heartbeats at 46.9, 52.0 and 57.0 seconds. Ben
  confirmed the X display and reconnected the receiver. Manual retry is the
  next verification step; this does not demonstrate a motor failsafe.
- Manual retry subsequently succeeded: `manual-retry` contains 316 samples
  per axis, all 128, with no read failures after A+B. The firmware remained
  responsive after reconnection with polling stopped. Neither that result nor
  the heartbeat proves a bound on an individual native I2C operation.

### Isolated loose-motor test

`motor-test` is separate from the car firmware and has no receiver reads.
Use it only with loose motors and no wheels/linkage. The other motor and PS2
receiver may remain connected; the test does not read the receiver and commands
only `testPort` in `main.ts` (currently M2).
It makes no motor commands on startup. Button A requests 20 degrees clockwise
at 15 percent; B requests 20 degrees counterclockwise. A+B requests a stop.
The finite angle is sent to Nezha in its movement command; no homing or absolute
angle is used. An additional stop is sent one second later. Presses during that
one-second interval are ignored, even if the motor has visibly stopped already;
leave two seconds between taps. Keep the physical
Nezha power switch accessible: these commands do not establish a reliable
software emergency stop or independently adjustable torque limit.

The first loose motor on M1 passed small movements in both directions and
stopping, confirmed by Ben. The `motor-one` capture records the commands and
additional stop requests. Ben made several presses/holds, accounting for
repeated requests. The movement triggers on button **release** (MakeCode uses
a click event), and hold duration does not change the finite angle.

The second loose motor on M2 also passed both directions and stopping, with
M1 and the receiver connected (`motor-two-connected` capture). Ben confirmed
M1 stayed still. An apparent need to press twice when reversing was resolved
by spacing taps: Ben confirmed it was the test's one-second busy interval.
These observations establish visible movement and stopping, not angle accuracy,
loaded steering performance, or a controller-loss failsafe.

Build with `run build motor-test`, flash with `run flash motor-test --confirm`,
and capture with `run serial 60 motor-test`. Motor movement needs explicit bench
readiness and a button press. Command transmission is not proof of movement or
stopping; record the physical observation. The current `car` startup is the
automatic-start driving program described above, not the earlier input-only program.
- Source inspection shows CODAL's `NRF52I2C::waitForStop` busy-waits, with a
  nominal 10-second timeout and a separate roughly 1-second STOP recovery wait.
  Its LASTTX workaround can also reset the timeout counter. These are native
  implementation details, not a diagnosis of the observed stall, but they
  demonstrate why the TypeScript readiness timeout is not a bound on an I2C
  transaction or on the whole control loop.

### Remaining sequence

1. Confirm A/B select the correct display and both axes of each stick have the
   expected orientation; LX and RY were not calibrated in the earlier control tests.
2. Investigate brief neutral readings, native I2C stalls and wireless freshness.
3. Build the chassis and measure steering center and safe travel manually. Check wrap boundaries and
   linkage direction; do not force stops or assume automatic homing is safe.
4. Configure measured steering limits and turn off `looseMotorBench`; verify with
   wheels raised before driving on the ground.
5. Test controller power-off, sleep, radio loss and receiver unplugging with
   wheels raised and physical power-off accessible. Record actual output and
   response time; keep fingers away from the mechanism.

## Primary references

- [Microsoft PXT CLI](https://makecode.com/cli)
- [PXT micro:bit target](https://github.com/microsoft/pxt-microbit)
- [Local editor server](https://makecode.com/cli/serve)
- [Pinned Nezha implementation](https://github.com/elecfreaks/pxt-nezha2/tree/1f37a92026cc53197fce86eb7c0e330caf9bb864)
- [Pinned PlanetX implementation](https://github.com/elecfreaks/pxt-PlanetX/tree/7bf603d7b17b994188b1993afe306e2ba86002a0)
- [Pinned PlanetX-AI dependency](https://github.com/elecfreaks/pxt-PlanetX-AI/tree/8ca01ab552efe04a17211586bddef0a813ae49e6)
- [Official PS2 receiver wiring (IIC)](https://wiki.elecfreaks.com/en/microbit/planetx-series/sensors/Plant_X_EF05068/)

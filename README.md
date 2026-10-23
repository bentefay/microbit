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

The Nezha's onboard buttons have run both motors in both directions. That is the
only user-confirmed motor test. They work independently of a micro:bit program.
The micro:bit enumerates over USB, confirming that the connected cable carries
data. Use its **micro-USB** socket for programming; Nezha's USB-C is for charging.

The receiver was initially connected to a motor port. Its correction to **IIC**
has not been confirmed. Switch the expansion board off and check the actual
labels before connecting it. Do not connect this receiver to M1–M4.

Proposed wiring is M1 = wheel drive and M2 = steering; neither port assignment is
confirmed. This is **one drive motor plus one steering motor**, not tank steering.
Chassis, wheels, gearing, linkage, center, travel, direction and weight are unknown.
Never find steering limits by driving into a mechanical stop.

## Controls and firmware status

The intended mapping is **left stick forward/back = proportional drive** and
**right stick left/right = proportional steering position**. That resembles the
movement/aim split in FPS controls. Returning the steering stick to center should
request the measured straight-ahead position. It must not merely stop a steering
motor wherever it happens to be.

`car` currently starts a **motionless commissioning program**: a tick on the LEDs,
button A displays ELI, and button B displays the tick again. It sends no motor
commands. **A+B toggles input-only PS2 logging**, so check the IIC connection before
using that diagnostic. It reports raw left-Y/right-X bytes, or -1 on readiness
timeout, through `run serial 30`. A failed read shows an X and stops polling;
after checking the receiver, A+B explicitly retries. If left-Y fails, right-X
is skipped and reported as -1 too. A serial heartbeat every five seconds helps
observe firmware responsiveness; it cannot interrupt a blocked native call.
Pure, tested mapping functions are in `controls.ts`; they are not
connected to actuators. Firmware compilation, successful USB transfer and an
observed hardware response are separate checks.

Verified on this machine: offline CLI builds of `blink` and `car`, native ARM
compilation in Docker, a successful USB flash/remount, and Ben's observation of
the tick and button A scrolling **ELI**. An isolated Chromium test also loaded
the repository project, converted its custom block to TypeScript and back, and
compiled it to HEX using the local native cache. Serial opening/closing was
tested. Live controller input commissioning is recorded below; motor commands
and loss-of-control stopping have **not** been tested on hardware.

Before movement can be enabled we need measured raw joystick center/range/sign,
dead zones, steering center and safe travel. Initial movement will use a low
configurable drive cap, explicit arming, neutral startup and accessible physical
power-off. Speed percentages are **not** an independently adjustable torque limit.

## Normal workflow

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
custom commissioning block is the round-trip case covered by `run editor-test`.

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
  display/button behavior. Recovery and cause are under investigation; do not
  enable motor control on this evidence.
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
Use it only with one loose motor, no wheels/linkage, and the PS2 receiver
disconnected. `testPort` in `main.ts` selects the port (initially M1).
It makes no motor commands on startup. Button A requests 20 degrees clockwise
at 15 percent; B requests 20 degrees counterclockwise. A+B requests a stop.
The finite angle is sent to Nezha in its movement command; no homing or absolute
angle is used. An additional stop is sent one second later. Keep the physical
Nezha power switch accessible: these commands do not establish a reliable
software emergency stop or independently adjustable torque limit.

Build with `run build motor-test`, flash with `run flash motor-test --confirm`,
and capture with `run serial 60 motor-test`. Motor movement needs explicit bench
readiness and a button press. Command transmission is not proof of movement or
stopping; record the physical observation. Restore `car` firmware after testing.
- Source inspection shows CODAL's `NRF52I2C::waitForStop` busy-waits, with a
  nominal 10-second timeout and a separate roughly 1-second STOP recovery wait.
  Its LASTTX workaround can also reset the timeout counter. These are native
  implementation details, not a diagnosis of the observed stall, but they
  demonstrate why the TypeScript readiness timeout is not a bound on an I2C
  transaction or on the whole control loop.

### Remaining sequence

1. Power off; inspect board labels and connections. Receiver goes to IIC.
2. Flash motionless commissioning firmware and observe its display/buttons.
3. With wheels lifted and steering linkage clear, test each motor independently
   at low output, after explicitly enabling a supervised test.
4. Log controller inputs with motor output disabled; measure center, endpoints,
   orientation, buttons and dead zones.
5. Measure steering center and safe travel manually. Check wrap boundaries and
   linkage direction; do not force stops or assume automatic homing is safe.
6. Integrate drive and position steering with explicit arming and low caps.
7. Test controller power-off, sleep, radio loss and receiver unplugging with
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

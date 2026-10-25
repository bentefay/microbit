# Experimental Xbox BLE input on micro:bit V2

## Left-stick LED display

The 5×5 matrix shows the left-stick position with the same bilinearly blended
moving dot as the MakeCode project's default display. Up on the Xbox stick maps
to the top row. Raw axes are normalized from -512..511, without smoothing or a
dead zone; small center offsets are visible as neighbouring LED brightness.
There is no fixed center marker. The screen stays blank before input arrives and
clears on a reported controller disconnect. A/B still start the diagnostic; they
do not change the displayed stick.

Every parsed gamepad report updates the matrix before the 10 Hz serial limiter.
The pinned Nordic display driver refreshes independently at the board's 50 Hz
setting (nominal 20 ms scan). We use its exposed 25-byte brightness framebuffer;
driver compatibility and dimensions are compile-time checked. Copying a new frame
does not disable interrupts or wait for a scan; a scan may span two frame updates.
This is visual feedback for judging lag, not a measurement of radio latency or
physical LED onset. `BP_DISPLAY,time,ready,updates` reports driver initialization
and how many input callbacks wrote the framebuffer. It cannot confirm visible LEDs.

This is the report-only Bluepad32 + BTstack + Zephyr port from
`Eli-controller-build-investigation-2026-10-25/eli-controller-source/microbit-bluepad-source`.
It replaces the MakeCode application when explicitly flashed. It does not replace
DAPLink, implement steering, or send motor commands. Hardware behavior is still
experimental; compilation does not establish pairing or reliable input.

## Container workflow

From the repository root:

```sh
run image bluepad
run build bluepad
run bluepad test
```

Image preparation (and explicit dependency-lock maintenance) needs network access.
The digest-pinned Debian Trixie/Node image installs CMake, native-test GCC, Python
and Python libraries through Debian's signed APT repositories. The ARM compiler
and C library come from the official Zephyr SDK 1.0.0, downloaded and SHA-256
verified inside the image using `toolchain/bluepad/sdk.json`.
`toolchain/bluepad/system-lock.json` checks installed
package versions for drift. There is no host pip, PlatformIO, west workspace,
compiler installation, or npm installation. The existing MakeCode image is separate.

Zephyr, Bluepad32, BTstack, CMSIS and the Nordic HAL are baked into the image from
exact commits. Each source archive must match the SHA-256 and size in
`toolchain/bluepad/sources.json` before safe extraction. Upstream source is not
patched. The imported app's CMake source roots now point into the image.

Compilation and packet tests run without a network, as the host UID/GID, with
capabilities dropped, no new privileges, a read-only container filesystem and
read-only project source. Only the chosen `built/` output directory and a temporary
filesystem are writable. No hardware, home directory or Docker socket is mounted.
Docker and the dependency-free Bun/TypeScript CLI run on the host. Safe-chain
applies to npm installation in the existing MakeCode image; it is not a runtime
sandbox or a scanner for APT/Python/C dependencies.

The native image uses a separate Trixie base because the existing Bookworm image
has an older CMake and lacks the packaged Python requirements. Both bases are
pinned by digest. `run bluepad versions` reports tools and Debian packages.
For deliberate maintenance, `run bluepad lock-base` resolves the configured base,
`run bluepad lock-sdk` resolves SDK release archive hashes through a container,
and `run bluepad lock-system` records an already-built image's package manifest.
Review and commit lock changes, then rebuild the image. Builds refuse stale image
recipes; package drift is an error rather than an implicit lock update.

## Output and checks

`built/report-only/binary.hex` is the verified diagnostic image. The directory also
contains a source/image/hash receipt, linked symbols, size report and the full
CMake build tree, including ELF, configuration, devicetree and map. These generated
files are ignored by Git. Every firmware build configures from a clean build tree.
The host CLI verifies Intel HEX checksums, excludes addresses at/above `0x7a000`
(including pairing storage and UICR), rejects unresolved symbols, checks key
Bluetooth implementations are linked and checks that motor code is absent.

`run build bluepad --nezha-compile-only` separately compiles and retains the
uninvoked motor adapter. It has its own output directory and is never selected by
the flash command. `run bluepad test` runs packet encoding tests with ASan/UBSan
inside the image. This adapter is speed/stop only, not position steering or a
complete control layer.

## Explicit programming and diagnostics

Only after authorizing programming:

```sh
run device
run flash bluepad --confirm
run serial 30 xbox-pairing
run bluepad monitor
```

The continuous monitor has no human-response timeout. Once a live `waiting`
heartbeat is observed, put one controller into pairing mode and press/release
either front micro:bit button (A or B). The firmware requires a stable release
before accepting a press, debounces for 40 ms, and begins scanning only once per
boot. A button held during startup does not count. Reset the board for a new run.
Button readiness starts a motionless diagnostic; it never authorizes motors.

Firmware emits `BP_STATUS` every second with protocol version, device uptime,
state, latched start-button mask (A=1, B=2) and total input-report count. The latch
survives delayed opening of serial, but resets on reboot. `BP_INPUT` snapshots
contain device time, report count, four axes, two triggers, buttons, D-pad and
miscellaneous buttons, capped at ten per second. A status heartbeat proves loop
liveness, not fresh controller radio input. Snapshots may omit brief button edges.

The monitor saves all serial lines in `.cache/observations/*bluepad-session*.jsonl`
and atomically updates `.cache/observations/bluepad-live.json`. State transitions
print a terminal bell and a clear instruction; sound depends on terminal settings.
No desktop notification service is required. Five seconds without status marks
readiness unverified without ending the wait. The capture remains open until
stopped or a transport error occurs; the agent must remain active to respond live.
The monitor neither builds nor flashes. `run bluepad inspect PATH [TEXT]` reads
pinned source files inside the native image for reproducible troubleshooting.

Builds never flash. Flashing checks the verified report-only artifact and unchanged
source, uses the existing device-correlated DAPLink transfer, then checks remount
and `FAIL.TXT`. It preserves the existing MakeCode source and built files. First
hardware checks should use disconnected motors. Firmware prints over 115200-baud
serial and logs gamepad snapshots at most ten times per second. These snapshots
can omit brief button edges; they are diagnostics, not a motor-control protocol.

Xbox 1708 needs compatible BLE firmware (Bluepad32 documents v5.15+); older
Classic firmware cannot work on this radio. Boot, pairing, sustained input,
disconnect/reconnect and bond persistence need physical testing. The last 24 KiB
of flash is reserved for pairing storage; static RAM size is not a runtime peak.

Original startup copyright/license notices and the supplied Bluepad32 license
notice are retained in `app/main.c` and `LICENSES/`. Upstream licenses, including
BTstack's separate terms, continue to apply. Dependency commits and archive hashes
come from the source bundle; its historical builds are not treated as validation
of this container integration.

The original host preparation scripts are deliberately not imported. Two build
integration fixes are encoded in the pipeline: Zephyr's compiler-capability cache
is explicitly under `/build/cmake/cache` so it cannot write into image sources;
and the ARM build uses the SDK 1.0 required by this Zephyr revision. Its supported
C library is Picolibc, selected in `prj.conf` instead of the imported Newlib setting.
Debian's ARM Newlib failed Zephyr's retargetable-locking requirement; SDK 0.17.4
was rejected by Zephyr's SDK version check. Neither check was suppressed.
The app's CMake also supplies `<stddef.h>` to Bluepad32's `uni_hid_device.c`, which
uses `ptrdiff_t` without including its standard header. This fixes reliance on a
Newlib transitive include without modifying the downloaded vendor source.

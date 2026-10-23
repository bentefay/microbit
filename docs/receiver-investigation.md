# PlanetX PS2 receiver investigation — 24 October 2026

Status: one error-handling defect fixed; intermittent lag, repeated directions and
center dropouts are **not yet fixed or attributed to a particular component**.
The motor-stopped receiver lab is selected. The normal car program remains available.

## Evidence from this hardware

Ben reports that motors follow the LED indication promptly, but both trail the
physical stick, with intermittent smooth tracking, long held directions followed
by jumps, and occasional return to center despite full deflection.

- Normal car: observed cycle maxima 68–72 ms; control-read group maxima 14–16 ms.
  These measurements do not support a 500–1000 ms software polling interval during
  those captures. They do not measure the age of the returned bytes.
- The full-circle capture on 23 October UTC has 29 approximately one-second
  snapshots. Both left axes were exactly 128 at host offsets 24.509 and 29.690 s.
  X and Y each reached 0 and 255. Snapshot logging cannot measure freeze duration.
- Earlier guided reversals included unexpected short raw-128 samples. Cue-to-input
  timing includes human reaction and cannot isolate radio latency.
- The first receiver-lab idle capture has 100 frames/300 successful transactions:
  readiness was 16 on the first attempt every time; no native errors; all axes 128.
  Readiness took 0–8 ms, writes/responses 0–1 ms each, cycles 83–86 ms. This capture
  included padded full-rate serial logging, subsequently disabled. It was an idle
  observation, not a controller-motion or freshness test.

Local captures are ignored under `.cache/observations/`. The initial lab capture is
`2026-10-23T22-55-08-939Z-receiver-idle-3f49807f.jsonl`.
After disabling line padding, `2026-10-23T22-57-41-341Z-receiver-unpadded-idle-047d3865.jsonl`
contains 130 centered frames/390 successful reads, with 76–80 ms cycles and the same
0–8 ms readiness / 0–1 ms command-response observations. No movement was reported
for either idle capture, so neither tests the lag complaint.

Validation: 39 host tests pass, including error propagation, readiness deadlines,
lab motor inactivity, fault latching, profile changes and trace analysis. Offline
PXT/native compilation passed. First diagnostic flash remounted with no FAIL.TXT
and produced live traces. The subsequent padding-only transfer synced, but the
desktop did not remount the drive within 30 seconds: that flash command reported
failure of verification. Live lab serial continued after the reboot with shorter
cycles; a verified USB remount is still required before another flash. Diagnostic
blocks/browser round-trip has not been tested in this investigation.

## Source investigation

Inspected public documentation, English and Chinese searches, MakeCode/forum
searches, all 44 PlanetX issue/PR entries, the standalone PS2 repo, the PlanetX
driver history, vendor repository listings, and the PlanetX/EF MicroPython trees.
No matching public lag report or internal transmitter/receiver firmware source
was found. This is a search limitation, not proof that no such source exists.
No vendor messages were sent and no new dependencies were installed.

| Source | Finding |
| --- | --- |
| [Official EF05068 wiring/use documentation](https://wiki.elecfreaks.com/en/microbit/planetx-series/sensors/Plant_X_EF05068/) | IIC connection, paired controller/receiver and sleep behavior; no timing, fresh-frame counter or firmware update procedure specified. |
| [Pinned PlanetX basic.ts](https://github.com/elecfreaks/pxt-PlanetX/blob/7bf603d7b17b994188b1993afe306e2ba86002a0/basic.ts#L3294) | Poll byte 0x10 from address 0x08; write axis command; read one byte. Each transaction ends with STOP. Readiness loop is unbounded. |
| [Latest basic.ts revision inspected](https://github.com/elecfreaks/pxt-PlanetX/blob/b8c11e94893b5a2a913f4f5e66e2c1ae7fc548c9/basic.ts) | Entire file was byte-identical to the pinned version fetched in this investigation. Updating the package does not provide a new PS2 fix. |
| [Standalone pxt-ps2](https://github.com/elecfreaks/pxt-ps2/blob/c0d1d0a0c980fcd1e27752b32b44a76826be73b2/main.ts#L500) | Same readiness/write/read sequence, with raw-byte output. No published issues at inspection time. This is a micro:bit driver, not firmware running inside the gamepad or receiver. |
| [PlanetX PS2 introduction PR](https://github.com/elecfreaks/pxt-PlanetX/pull/12) | Adds the micro:bit side of the protocol; no radio-loop implementation. |
| [PlanetX issue history](https://github.com/elecfreaks/pxt-PlanetX/issues?q=is%3Aissue+is%3Aclosed) | Reviewed alongside open issues/PRs through the API; no matching timing fix found. |
| [MakeCode micro:bit pins.cpp](https://github.com/microsoft/pxt-microbit/blob/v9.1.1/libs/core/pins.cpp) | i2cReadBuffer ignores native return status; i2cWriteNumber also discards the status returned by i2cWriteBuffer. |
| [Pinned NRF52 I2C implementation](https://github.com/lancaster-university/codal-nrf52/blob/1fbb7240290fe36a55c61378f5cdeb7640f3ec4a/source/NRF52I2C.cpp) | Synchronous native waits, default 10 s timeout plus STOP handling; workaround can reset the wait counter. Outside TypeScript timeouts cannot interrupt this. |
| [Upstream native hang discussion](https://github.com/lancaster-university/codal-nrf52/pull/40) | Documents STOP/hang handling. The inspected pinned driver already contains that fix. It does not explain successful, short reads returning repeated input. |

Axis command bytes: RX=25, RY=26, LX=27, LY=28. `get_Attention_Value` means
button state here, not radio freshness. Readiness=16 is also a valid axis sample;
we must not discard axis samples equal to 16. The older deprecated `joystickval`
API is for different hardware. Generic Sony PS2/SPI drivers cannot establish the
protocol inside this particular IIC product.

Our original adaptation matched the vendor's command/STOP sequence. Differences
were bounded/yielding readiness polling and removing the vendor's +1/×4 scaling.
It did not cache bytes, smooth demand or intentionally poll at half-second intervals.
X and Y are independent transactions, not a documented atomic radio snapshot.

## Implemented correction

`receiver-transport.cpp` is a small native wrapper around the **existing** CODAL
bus. It preserves success/error status on each read and write instead of silently
accepting a failed read as an axis byte. `receiver.ts` returns:

- 0–255: successful raw byte, including real 0, 16 and 128.
- −1: bounded readiness attempts/deadline exhausted.
- −2: native read failure.
- −3: native command-write failure.

Readiness, write and response durations/status are recorded separately. Normal
driving still stops/latches on any negative result. A failed read cannot now turn
into a spurious full-deflection raw zero. **This cannot by itself explain exact
center 128 or successful repeated bytes.** Native wait limits remain unchanged;
do not treat this as a bounded native driver or a radio-loss failsafe. No receiver
firmware, native runtime, bus clock or dependency pin has been changed.

## Reproducible diagnostic

```sh
run car-mode receiver-lab
run test
run build car
run flash car --confirm
run serial 30 receiver-baseline
run receiver-report .cache/observations/FILE.jsonl
```

Lab startup requests stops on M1/M2 and never sends a movement command. A advances
the profile, B returns to profile 0. The selected profile is snapshotted for the
whole cycle. On any error it shows X and stops polling until reset. The LED dot
always shows the left joystick; A/B have different meanings from driving mode.

| Profile | Axis sequence | Command-to-response pause | Explicit loop pause |
| --- | --- | --- | --- |
| 0 | LY, RX, LX (car order) | 0 | 20 ms |
| 1 | LY, LX | 0 | 20 ms |
| 2 | LY, LX | 2 ms | 20 ms |
| 3 | LY, LX | 10 ms | 20 ms |
| 4 | LY, LX | 0 | 80 ms |
| 5 | LX, LY | 0 | 20 ms |

MakeCode `forever` scheduling, computation, serial output and I2C time are additional;
the report measures actual intervals. These pauses are **hypotheses to compare**,
not vendor requirements or a claimed fix. Readiness polling remains bounded and
uses the documented command bytes. No speculative register writes or bulk-read
protocols are used. Only this fiber accesses the receiver; do not add concurrent
receiver readers, especially while a delayed response is pending.

Every read is logged after the axis group finishes, with device timestamps:

```
RX_READ,sequence,profile,command,startMs,endMs,raw,attempts,firstReady,lastReady,readyMs,writeMs,responseMs,nativeStatus
RX_FRAME,sequence,profile,startMs,endMs,LX,LY,RX
```

RX is −1 in two-axis profiles because it was not read. In faulted frames LX/LY may
be −1 because they are incomplete. Response time excludes the configured settle
pause; whole-read time includes it. Serial padding is disabled to reduce observer
overhead. The host logger preserves every complete line but prints only every
twentieth frame and fault messages. Capture gaps/profile switches/resets are not
bridged when calculating repeated-value spans.

Use the same slow continuous full-deflection rotation for baseline/profile
comparisons. Identical readings with a stationary stick are normal. Repeated-value
spans are sampled observations, not packet-age measurements. A single centered
frame has observed span 0 ms, not evidence that the event had zero duration.

Interpretation:

1. A reliable improvement only after a response pause supports a response timing
   hypothesis; repeat baseline→variant→baseline before choosing that setting.
2. Improvement with fewer axes/slower polling supports receiver servicing/load
   sensitivity. Reversing order tests dependence on the previous command and
   the timing skew between X and Y.
3. Repeated values/128 dropouts with successful short transactions in all profiles
   leave the internal receiver/radio/controller path as the main unresolved area.
   Fresh AAA batteries and moving the receiver away from the PC/hubs can then be
   compared without changing software. Neither has yet been controlled here.
4. Native errors or long transactions point back to I2C, power, wiring or native
   driver behavior; their return status separates them from valid data bytes.

If needed, vendor questions are: expected report interval, internal polling source,
meaning of 0x10, minimum inter-command spacing, atomic multi-axis read support,
packet-age/link status, behavior on missed radio packets, and available receiver
firmware updates/source. A logic analyzer could verify clock stretching and wire
bytes, but cannot reveal radio packet age unless the protocol exposes it.

Restore driving only for the controlled loose-motor setup:

```sh
run car-mode drive
run build car
run flash car --confirm
```

Source inspection is reproducible with `run research HTTPS-URL [TEXT]`. It uses
only Bun's built-in fetch, allows explicit public GitHub/ELECFREAKS hosts, saves
URL/time/body/hash under `.cache/research/`, and never executes downloaded content.

## Full-rate circle baseline

Capture `2026-10-23T23-05-37-628Z-receiver-circle-baseline-f5ab4d75.jsonl`:
Ben reported starting continuous full-deflection rotation before the 30-second
recording; instructed to stop after completion. Profile 0 throughout, motors stopped.

- 377 complete XY frames, 1,133 complete read records. Partial terminal line excluded;
  independent read records at capture boundaries need not form complete frames.
- Actual frame intervals 76–81 ms, median 80 ms; no long software-loop pause.
- Longest unchanged XY observation spanned 1,013 ms. Longest interval between
  observed XY changes was 1,092 ms. End-stop saturation/quantization can also
  repeat values, so these spans alone do not establish radio packet age.
- Both axes returned exactly 128 in two runs: one isolated frame and an eleven-frame
  run spanning 780 ms. That is inconsistent with the reported continuous full-rim
  movement and is much longer than the approximately 19 ms axis-group sampling skew.
- No native I2C errors. All 1,133 readiness reads returned 0x10 on their first
  attempt. Readiness 0–8 ms, writes/responses 0–1 ms, whole axis reads 1–9 ms.

This reproduces the symptom in successful, fast receiver transactions with motors
stopped. It rules out a half-second polling pause in this capture, but does not yet
separate receiver response/protocol timing from controller/radio/internal firmware.
Next comparison: profile 1 (one A press), omitting RX while keeping the zero response
delay and explicit 20 ms loop pause; then compare profile 1 to a response-delay mode.

## Two-axis comparison

Capture `2026-10-23T23-07-10-570Z-receiver-circle-two-axes-39849d77.jsonl`:
Ben confirmed starting the instructed A-press/rotation step. Profile 1 was observed
throughout the 30-second capture; the stop instruction followed capture completion.
All 459 complete frames were exactly LX=128, LY=128, spanning 29,917 ms. Frame
intervals were 64–68 ms (median 65 ms). All 918 complete reads succeeded, with
first-attempt readiness=16, readiness reads 0–8 ms and writes/responses 0–1 ms.
The initial unframed serial suffix and terminal partial line are not counted.

This is a complete absence of reported movement, not merely slower updates. It
cannot yet be attributed to removing RX: controller sleep/power/radio state has
not been independently observed. Next step is a short return to profile 0 via B,
with the same physical movement and no intervening controller power/button change,
to test whether the behavior reverses with the mode change.

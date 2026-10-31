# Settings mode: specification

Status: implemented 2026-10-31 in the native `--motor-drive` variant. This is the
durable UX and implementation record. Physical feedback, persistence across
power cycles and the encoder reference still need Ben's bench check.

## Goal

Tune three motor settings from either commissioned Xbox controller, without reflashing,
saved across power cycles. Settings apply live while both sticks still drive and
steer, so each change can be tested immediately.

| Setting | Spoken / scrolled | Default | Range | Step |
| --- | --- | --- | --- | --- |
| Max drive speed (M1 full-stick %) | "Speed" / `SPEED` | 20 | 5–100 | 5 |
| Steering centre (M2 absolute angle) | "Steering centre" / `STEERING CENTRE` | startup encoder angle (see Encoder) | 0–359, wraps | 2° |
| Steering range (± degrees about centre) | "Steering range" / `STEERING RANGE` | 45 | 5–360 | 5° |

Defaults reproduce today's firmware, so the first flash of the new firmware is no
more aggressive than the current one. Ben subsequently requested a ±360° maximum
in 5° steps. This supersedes the original ±80° cap. The worker now tracks cumulative
encoder travel and issues short `0x5d` waypoints instead of sending the final wrapped
angle directly: full left to full right at maximum range means **720° of travel**.
These remain loose-shaft bench limits, not calibrated chassis limits.

## Controls (either commissioned controller)

Either blue or Eli's controller (stable identities in `controller_roles.h`) can
open settings. The controller that opens it owns that session: its Menu saves,
View cancels and D-pad adjusts. The other controller keeps normal driving but its
settings buttons cannot interfere until the session ends. This supersedes the
original blue-only restriction at Ben's request. Blue A (override) and each
controller's B (split/either toggle) keep their meanings.

- **Menu (≡)** = Bluepad32 `MISC_BUTTON_START`: enter settings mode; press again to
  **save and exit**.
- **View (⧉)** = `MISC_BUTTON_SELECT`: **cancel and exit**, reverting live values
  to the last saved values.
- **D-pad left/right**: previous/next setting, cycling Speed → Steering centre →
  Steering range. Entering selects Speed.
- **D-pad up/down**: increase/decrease the selected setting by one step; applies
  immediately. Hold to auto-repeat (about 400 ms delay, then about 150 ms repeat).
  Clamp at limits (centre wraps).
- Use edge detection like the existing held-button handling: a button already
  held on the first report must be released before it acts.
- Disconnecting the editing controller while in settings mode cancels (reverts) and
  exits. Micro:bit A+B abort still latches stop as today.
- **Factory reset:** holding micro:bit button A during boot restores defaults
  (and saves them after successful stop commands to both motors). Release A after
  the two-note confirmation. This does not erase controller bonds. Holding A+B
  also requests the existing latched motor stop.

## Live behaviour

- Speed: changes the full-stick cap immediately (`drive_axis` cap is a runtime value).
- Centre: the steering target is recomputed and M2 moves to the new centre
  (offset by any current stick deflection) as soon as it is pressed. That motion
  is caused by the press; there are no other "demonstration" movements.
- Range: recomputed immediately; hold the stick at full lock and press up/down to
  watch the limit move.
- Steering uses the raw signed `0x46` cumulative reading every 50 ms, from the
  dedicated I2C worker. Each position waypoint is at most 60° from measured
  position and advances when within 5°. A new demand replans from measured position;
  a held demand cannot accumulate turns. Wraparound centre edits remain 2° steps.
  Read failures, reads taking over 150 ms, feedback older than 150 ms, or raw jumps
  over 90° between samples stop both motors and latch a fault. The existing 100 ms
  I2C transfer timeout bounds each transaction. No vendor readiness loop or motion
  wait is used. Actual multi-turn encoder continuity still needs bench verification;
  wrapping/resetting feedback is rejected rather than guessed around.
- The planner must re-emit speed/target writes when settings change even if the
  stick has not moved. Keep command suppression otherwise.

## Feedback

**Display** (owns the 5×5 matrix only while in settings mode; the normal
owner/input display returns on exit):
- On entering a setting, scroll its full name once (font only needs the letters used).
- Any up/down press stops the scroll and shows the value bar immediately; a
  left/right press during a scroll switches to the next setting and scrolls its name.
- After the scroll, show the value as a bar/level graph (resolution is coarse;
  exact values go to serial telemetry).

**Speech** (micro:bit speaker): play the clip for the selected setting when it is
selected (on entry and on each left/right). Clips are Kokoro-82M, voice
`af_heart` by default (`af_bella` is the alternative Ben may choose by ear).

**Tones** (speaker, no recordings): short click rising/falling for up/down, double
buzz at a limit, rising chirp on entry, two-note confirmation on save, falling
tone on cancel.

**Rumble** (editing controller): short buzz per step, stronger at a limit, distinct
patterns for enter/save/cancel.

Implemented feedback: entry = rising 140 ms chirp followed by “Speed”, plus a
medium 120 ms buzz. Selection = the selected name and a light 30 ms buzz.
Up/down = rising/falling 40 ms click plus a light 40 ms buzz. A clamped limit =
two low speaker buzzes and two stronger 60 ms rumbles. Save = two ascending notes
over 240 ms and two 70 ms rumbles. Cancel = a falling 180 ms tone and one longer
250 ms rumble. Disconnect cancellation has its speaker tone but cannot rumble a
disconnected controller. Factory reset plays the save tone, with the normal
display and no rumble request. A/B, sticks and A+B do not gain extra sounds or
rumbles. No extra demonstration movement is introduced.

Names scroll at **200 ms per column** (half the original speed), once, then the bar fills from the bottom left
across each row to the top. The 25 LEDs represent 0–100%, 0–359°, or 0–360°;
low values may share an empty or single-pixel bar, while centre 0° is blank. It is deliberately
coarse, not a numerical readout. Up/down (including a limit press) immediately
shows the bar; navigation starts the new name. Rapid actions replace unfinished
speech/tones. Exit immediately restores the usual ownership/input display.

## Persistence

- Store in the existing BTstack TLV flash bank (24 KiB storage partition at
  `0x7a000`, two 12 KiB banks, configured in `main.c`). Use app tag `'MBST'`
  (free; existing tags are `BTD*`, `SMIR`, `SMER`, `BTC*`, `BTDB`, `GDB*`, `BP3*`).
  Ten-byte v2 record: version, speed, centre offset (little-endian 16-bit), range/5,
  reference flag 1, IEEE CRC32 over the first six bytes (little-endian CRC).
  Invalid/missing/out-of-range → defaults. Old v1 records (range in degrees, max
  80) remain readable; no migration write is made unless values change. v2 fits
  360° in the existing byte using five-degree units. Centre semantics are unchanged.
- Write only on save-and-exit, and only if values changed.
- **Never erase/write flash while a motor is commanded.** A page erase halts the
  CPU for up to ~90 ms (stalls I2C) and blocks the BTstack thread; radio sync
  (`SOC_FLASH_NRF_RADIO_SYNC_TICKER`, already on) delays it into radio-free slots.
  Menu accepts in RAM immediately; if moving, defer the write. The implemented
  MBST write guard is stricter: wait for M1's commanded speed zero and centred
  selected control axes (including an unused deflected stick), then the motor
  worker explicitly stops M1 and M2 and acknowledges a hold. No new motor command
  can start until TLV write plus readback finishes and the hold is released.
  This prevents mistaking M1 zero for completed M2 steering motion. A failed stop
  prevents the write. Readback failure leaves the save pending and retries after
  five seconds. `CONFIG_SOC_FLASH_NRF_PARTIAL_ERASE=y` (3 ms slices) and radio
  ticker synchronization are verified by the build. This guard covers application
  settings writes; the existing Bluetooth bond store retains upstream behavior.
- “Save” feedback acknowledges acceptance, not durable storage. Centre both
  sticks and keep power on until the monitor says `stored` / `pending: false`.
  Cancel reverts to the last **accepted** save in this boot, even if that save is
  still pending. Re-entering settings pauses a pending write. Power loss before
  `stored` may retain the previous record. Unchanged saves do not write flash.
  Changing values and restoring them before saving also does not write, including
  reverting an earlier deferred save. The adapter checks both the cached values
  and actual encoded TLV bytes before calling `store_tag`, so retries cannot append
  an already-matching record. Repeating factory reset when a valid default record
  exists is a no-op as well.
- Endurance is not a practical concern (append-only records; ~10,000 erase cycles per page).
- Whether a DAPLink reflash preserves the storage partition is unverified (bonds
  have survived resets, not necessarily reflashes). Record what happens.

## Encoder: open question

`initialize()` captures centre from `0x46` (tenths of a degree, `% 3600`). The
vendor sources do not say whether this angle is absolute across power cycles.
A saved centre is only meaningful if it is. Print the raw `0x46` reading at boot
in telemetry, then verify once on the bench: note the reading, power off, turn
the M2 shaft by hand about 90°, power on, compare. If it is absolute, store
centre as an absolute angle. If it is relative to power-on, document it, keep the
saved centre as an offset from the power-on reading, and tell Ben to park the
steering centred before power-off.

**Implementation decision while this is unverified:** v1 and v2 store centre as a
modulo-360 offset from the boot reading, not as a claimed persistent absolute
reference. The UI/telemetry still show the current boot's absolute target angle
0–359°. A saved +2° adjustment is reapplied as +2° to the next boot's capture.
Park centred before power-off. If Ben establishes a stable absolute reference,
change the record version/reference flag with an explicit migration decision;
do not silently reinterpret existing offset records. A fresh factory reset uses
offset zero. This preserves today's capture-at-boot behavior without pretending
the encoder question is resolved.

`BP_ENCODER,time,raw_tenths,boot_centre` repeats the boot capture every second so
a monitor opened after flashing can recover it. It is not live shaft feedback.
Power-cycle cue: note `rawTenths`, remove power from **both** micro:bit and Nezha
(USB can keep the micro:bit alive), turn the unpowered M2 shaft about 90° by hand,
restore power, compare the new raw reading modulo 3600. About ±900 tenths supports
a persistent reference; a reset/unchanged reading suggests a power-on reference.
Record the observation before changing persistence semantics.

## Implementation notes from research (pinned revisions)

- Buttons: `uni_gamepad_t.dpad` (`DPAD_UP/DOWN/RIGHT/LEFT`), `misc_buttons`
  (`MISC_BUTTON_SYSTEM/SELECT/START/CAPTURE`); Xbox BLE maps View→SELECT,
  Menu→START (`uni_hid_parser_xboxone.c`).
- Rumble: `d->report_parser.play_dual_rumble(d, start_delay_ms, duration_ms, weak, strong)`
  (magnitudes 0–255). Must run on the BTstack thread. Hazard: the Xbox parser
  passes a stack-local report buffer that `hids_host` may send later if the GATT
  client is busy (for example, during the `0x2a4a` liveness probe). Don't rumble
  while a probe is pending, or send the output report yourself from a static buffer.
  Implemented: immutable static report payloads, hardware-bounded durations and
  repeat counts, sent on the BTstack thread only, deferred while the editor's probe is
  pending. No upstream rumble timer callback is used. Unsent feedback expires
  after 500 ms. A successful HIDS enqueue is not physical rumble verification.
- Speaker: P0.00, board DTS `buzzer0` on `&pwm1` ch0 (inverted). LED matrix uses
  PWM0 + TIMER4; PWM1 is unused because `CONFIG_PWM` is off. Use nrfx PWM directly
  (`CONFIG_NRFX_PWM`, `nrfx_pwm_simple_playback`, EasyDMA buffers in RAM, own
  IRQ) and keep Zephyr's PWM driver off PWM1. Playback must not block the motor
  loop or BTstack. CODAL uses PWM1 at 44.1 kHz; 16 kHz samples are enough here.
  Implemented: 16 MHz / 1000 = 16 kHz PWM, two 256-sample static RAM DMA buffers,
  short IRQ refills, and a separate low-priority worker for requests. A new action
  replaces obsolete audio; PWM stop waiting is bounded at 10 ms. The build rejects
  Zephyr PWM ownership and verifies required flash/PWM configuration.
- Flash budget: motor-drive firmware uses about 249 KB of 488 KB, so clips
  (about 2–3 s total after trimming) fit easily.

## Speech assets

Pipeline (checked in): `toolchain/tts/` + `cli/tts.ts`.
`run tts lock-base | lock | image | generate`. Kokoro-82M (Apache-2.0), CPU
torch, hash-locked requirements and Hugging Face assets, synthesis runs with
`--network none`. `workspace/projects/bluepad/audio/prompts.json` defines the clips;
`audio/candidates/<voice>/*.wav` are 24 kHz 16-bit outputs. Regeneration was
verified byte-identical by the preceding session. `run tts firmware [af_heart|af_bella]`
now converts the chosen WAVs to checked-in `app/speech_data.h`, with source/PCM
hashes and conversion metadata in `audio/firmware.json`. It uses a low −60 dB
trim threshold, 100 ms preroll and 120 ms tail, a 64-tap windowed-sinc 7.2 kHz
low-pass resampler to 16 kHz, and peak normalization to 80% before unsigned
8-bit PCM quantization. Default af_heart occupies 48,257 bytes (~3.02 s).
Changing voice requires conversion, build and a separately authorized flash.
The candidates remain playable under `audio/candidates/af_heart/` and
`audio/candidates/af_bella/` (speed, steering-centre, steering-range WAVs).

## Tests and telemetry

`run test` covers WAV validation, deterministic PCM hashes, conservative trimming,
normalization, alias rejection, and settings/encoder/audio monitor parsing.
Latest run: 69 CLI tests / 798 assertions passed. Host mount recovery additionally
checks the exact USB parent before asking udisks to mount only a FAT volume.
`run bluepad test` runs twelve native suites under ASan/UBSan. Settings coverage
includes identity, connection-held keys, repeat timing/wrap and stale stop,
limits/wrapping, save/cancel/disconnect, CRC corruption/range checks, scroll/bar,
bounded feedback, live planner re-emission, and the real settings adapter with
fake flash/motor interfaces (deferred save, stale acknowledgement, re-entry,
unchanged-save suppression, readback failure/retry, reboot load, factory reset).
Additional coverage: full ±360° path, 720° reversals, mid-travel reversals, held
targets without encoder progress, raw discontinuities, timer wrap, v1 read/no-write
and v2 persistence, and the real motor worker with simulated encoder/I2C faults,
A+B abort and save-hold. Audio tests prohibit global IRQ masking.

`BP_SETTINGS,time,event,active,selected,speed,centre,range,pending` carries exact
values. `BP_AUDIO,time,init|status,result,16000` reports audio driver initialization
or stop failure. `BP_AUDIO_PLAY,time,started,completed` reports playback progress
(a replaced clip does not count as completed).
`BP_RUMBLE,time,event,result,slot` records successful enqueue to the editing pad. None
of these proves visible LEDs, intelligible speech, felt rumble or physical motion.
`BP_STEERING,time,position_tenths,target_degrees,waypoint_degrees` adds unwrapped
feedback/path coordinates anchored to the boot centre. The monitor also retains
disconnect reasons/counts separately from observed firmware uptime restarts.
Bench feedback, actual save/reboot/reset behavior, flash-bank migration under
load, radio-loss timing during feedback and DAPLink preservation of MBST remain
unverified until physically exercised.

Both final builds passed: motor-drive uses 302,408 bytes text + 1,456 initialized
data and 54,905 BSS; report-only uses 245,316 + 1,280 + 49,653 bytes respectively.
Motor-drive HEX SHA-256:
`685c1a505c136d8d29955eb4413dc875e96c70badb44ddd33a363c97c5900f7e`.
The first authorized transfer ran the firmware, but desktop automount did not
return. `run device --mount` recovered the same USB device, remount count 0→1,
with no `FAIL.TXT`. This recovery is now part of the checked-in flash command.
Post-transfer telemetry showed a live scanning heartbeat, no connected pads,
and latched motor initialization fault `-5` with four attempted I2C writes.
No boot encoder capture was obtained. This is consistent with an unavailable
Nezha I2C endpoint; power, seating and wiring have not been physically checked.
Power/check the Nezha and reset the micro:bit before testing settings. The firmware
intentionally does not retry a latched motor fault or arm without a valid capture.
The same verified image was then flashed again to validate automatic mount
recovery: successful same-device remount/no `FAIL.TXT` at 08:38:12 UTC. Monitoring
restarted at 08:38:17 UTC and again observed live scanning plus I2C `-5`. No
physical readiness is claimed. If removing USB for the encoder test ends the
recorder, restart `run bluepad monitor` after reconnecting; its repeated boot
capture makes the initial serial lines unnecessary.

## Follow-up: sound, scrolling and both controllers

Ben subsequently connected the micro:bit to Nezha and reported no sound and overly
fast scrolling. Fresh monitoring at 10:13 UTC showed both controllers connected,
I2C result 0, boot encoder raw 0, and accepted speed 100% / centre 0° / range ±45°.
This supersedes the initial unavailable-Nezha observation above; it does not
resolve the encoder power-cycle question or prove physical motion.

The silent-audio cause was in our queue handling: every request called
`k_msgq_purge`, which wakes a blocked reader with `-ENOMSG`; the audio worker's
`while (get == 0)` then returned permanently. Initialization status remained 0.
Pinned source: Zephyr `c425eabae5724d39fdd828d31ec35dc850795fe1`,
`kernel/msg_q.c:z_impl_k_msgq_purge`, lines 501–523. The fix replaces only already
queued requests and keeps the worker alive after interrupted reads. Native tests
now exercise the real audio adapter with that blocked-reader behavior plus
first/second playback completion. Playback counters make this failure visible.
Scroll speed is halved, and either known controller may open its own session.
Both identities retain first-report held-button suppression and disconnect cancel;
only the editor's peer responses keep its D-pad repeats alive.

Follow-up builds and all ten native sanitizer suites passed. Motor-drive
text/data/BSS is 302740/1456/54922 bytes; report-only remains
245316/1280/49653. Verified motor-drive HEX:
`d588d814ef607fa401756d1cfbb9f370536ae3a11e9ab732ccfa2dcf144b1be9`.
Authorized flash completed at 10:19:46 UTC, same-device remount, no `FAIL.TXT`;
monitor restarted at 10:19:47 UTC. Fresh heartbeat: I2C 0, M1 stopped awaiting
input, encoder raw 5 tenths, audio status 0, playback counters 0/0. Settings are
20% / centre 0° / ±45°, pending false: **the previous accepted 100% speed was not
retained through this DAPLink flash**. Ordinary save/power-cycle persistence
still needs its physical check; builds and normal restarts are distinct from
reflashing. No controllers were connected in the initial observation and no
audio action had been requested. The fix's audible output remains unverified.

## Repeated-adjustment disconnect diagnosis and wider steering

Ben reported an apparent crash/reset while repeatedly adjusting centre. The
10:19:47 capture shows Eli disconnecting at device times **143236** and **175191**
ms with **0x3d (MIC failure)**, immediately followed by settings cancellation.
Uptime and playback counters continue: neither event is a micro:bit reboot.
There is no changed-value save/store before either event; unsaved edits reverted
to the accepted 20% / 0° / ±45° settings. The falling cancellation tone explains
the sound at the same time. This does not demonstrate persisted-record loss.

The audio startup code globally masked interrupts while generating 512 samples.
This build does not enable zero-latency radio interrupts, so it also blocked the
Bluetooth controller. Changed to mask only PWM1 while replacing its stopped
playback state. This removes a concrete radio timing hazard; attributing the
observed MIC failures to it remains a hypothesis pending repeated hardware input.
No rumble feature or disconnect-cancellation semantics were removed.

Pinned source evidence: Zephyr `c425eabae5724d39fdd828d31ec35dc850795fe1`,
`include/zephyr/bluetooth/hci_types.h` (`BT_HCI_ERR_TERM_DUE_TO_MIC_FAIL`),
`subsys/bluetooth/controller/ll_sw/nordic/lll/lll.c` (IRQ flags/priorities), and
the resolved build configuration (`CONFIG_ZERO_LATENCY_IRQS` off). Vendor motor
source: [pxt-nezha2 at 1f37a92](https://github.com/elecfreaks/pxt-nezha2/blob/1f37a92026cc53197fce86eb7c0e330caf9bb864/main.ts),
`readAngle`/`readRelAngle` expose cumulative signed tenths; `moveToAbsAngle`
normalizes to 0–359. That is why the new ±360° range needs feedback and waypoints,
not merely a larger UI maximum. The raw reference across power cycles remains
unverified and the boot-relative persistence decision is unchanged.

Both builds passed. Motor-drive text/data/BSS is 303340/1456/54922 bytes;
report-only remains 245316/1280/49653. Verified motor-drive HEX
`5f0af7d7a316655cf21f5c9d545379ecb6d33389f4759738a3b5b000e694d539`
was separately flashed with authorization at **10:29:17 UTC**, same-device remount,
no `FAIL.TXT`. Monitoring restarted at 10:29:20 UTC. Fresh telemetry shows Eli
connected, awaiting first input; successful ongoing encoder polls, raw boot 0,
unwrapped position 0, defaults 20% / centre 0° / ±45°, no pending save and audio
status 0. No repeated input or multi-turn movement was requested in that initial
observation; it does not verify the disconnect fix or physical travel.

# Xbox bench runsheet: minimal human involvement

The assistant prepares code, tests, builds, authorized flashing and continuous
monitoring before requesting physical actions. Builds and flashing remain separate.
Motors stay disconnected throughout these diagnostic stages.

## Session procedure

1. Prepare and verify the firmware; start `run bluepad monitor`.
2. Observe a fresh `waiting` heartbeat. For LED checks also verify
   `BP_DISPLAY` reports ready. Do not infer readiness from USB presence alone.
3. Send one visible action card with the complete physical sequence. The user
   starts by pressing/releasing micro:bit A or B; no typed confirmation is needed.
4. Keep monitoring while the assistant turn is active. Human response time has no
   test deadline. Firmware starts scanning once per boot and retains the start
   button in its heartbeat, so a missed serial instant does not lose the signal.
5. Evaluate captured evidence and request only the missing physical observations.
   Save the result before moving to the next stage. Do not rebuild or repeat passed
   actions unless a change or failure warrants it.

`run bluepad report CAPTURE.jsonl` reports the latest observed boot's control
coverage and display update count. Previous boot data stays in the raw capture.
The recorder can continue after an assistant turn, but a running recorder alone
does not schedule the assistant to resume; live supervision requires an active turn.

## Stages

| Stage | User action, after readiness cue | Automatic evidence | Status |
| --- | --- | --- | --- |
| First controller pairing | Pair mode, press A | Start latch, encryption/pairing/HID logs | Passed |
| Input coverage | Sweep both sticks, squeeze triggers, press face buttons and D-pad, release | Ranges, button masks, sampled neutral return | Passed |
| Left-stick LED feedback | Same controller on, press either button, move left stick | Start latch, connection, framebuffer update count | Passed via A; both left axes covered, 1658 display updates at checkpoint |
| Alternate start button | Press B for a later fresh session | B start latch | C tests passed; physical B check pending |
| Visual correctness | Watch dot move with left stick; report only problems | Requires human eyes; telemetry cannot prove visible output | Pending |
| Controller off/on | Turn controller off, wait for next cue, turn it on normally | Disconnect/reconnect events, new reports | Pending |
| Board restart persistence | Reset micro:bit, then press either front button with controller on | New boot, retained bond, encrypted reconnect without pairing | Unverified: LED reflash session performed fresh pairing |
| Second controller | First controller off; second in pairing mode, start fresh session | Identity distinction, pairing, input coverage | Pending |
| Motor commissioning | Separate controlled bench setup and measured steering limits | Separate implementation and review | Not authorized by these diagnostic starts |

Keep restart persistence distinct from pairing again. Time between a cue and input
includes human reaction; it is not radio latency. A firmware heartbeat proves loop
liveness, not controller radio freshness. The LED display is visual feedback with
a nominal 50 Hz scan, not an instrumented end-to-end latency measurement.

/** Supervised loose-motor test, NOT calibrated for a chassis or steering linkage. */
namespace car {
    // Bench settings: measured axes 0/128/255, provisional dead zone 8.
    const driveCap = 20
    const steeringTravel = 45
    const steeringSpeed = 15
    const controlPauseMs = 20
    const deadZone = 8
    const invertDrive = true
    const invertSteering = false

    //% blockId=car_start_controller_bench block="start controller bench (loose motors only)"
    export function startControllerBench() {
        runControllerBench(false)
    }

    //% blockId=car_start_latency_test block="measure controller latency (loose drive motor only)"
    export function startLatencyTest() {
        runControllerBench(true)
    }

    function runControllerBench(latencyTest: boolean) {
        // 1 waiting for neutral, 2 active, 3 receiver fault (restart to retry).
        let state = 1
        let neutralSamples = 0
        let center = 0
        let lastDrive = 999
        let lastSteering = 999
        let previousCycle = 0
        let lastTimingReport = 0
        let maxCycleInterval = 0
        let maxReadDuration = 0
        let maxCommandDuration = 0
        let trial = 0
        let nextCue = 0
        let lastRawLeft = 128
        // Nezha can keep running across a micro:bit reset: request stops first.
        nezhaV2.stop(nezhaV2.MotorPostion.M1)
        nezhaV2.stop(nezhaV2.MotorPostion.M2)
        basic.showIcon(IconNames.SmallSquare)
        serial.writeLine(latencyTest ? "LATENCY: loose M1 only; center sticks, then first LEFT-stick forward starts cues; physical power switch stops" : "BENCH: loose motors only. M1 drive, M2 steering, receiver IIC. Center sticks to start; no buttons. Power switch stops. Radio freshness UNKNOWN.")

        basic.forever(function () {
            let cycleStarted = input.runningTime()
            let cycleInterval = previousCycle == 0 ? 0 : cycleStarted - previousCycle
            previousCycle = cycleStarted
            if (state == 3 || state == 4) {
                if (input.runningTime() - lastTimingReport >= 1000) {
                    serial.writeLine(state == 4 ? "LAT_DONE: motors stopped; restart to repeat" : "BENCH: receiver fault; restart to retry")
                    lastTimingReport = input.runningTime()
                }
                basic.pause(100)
                return
            }
            if (latencyTest && state == 2 && trial > 0 && input.runningTime() >= nextCue) {
                if (trial >= 8) {
                    nezhaV2.stop(nezhaV2.MotorPostion.M1)
                    nezhaV2.stop(nezhaV2.MotorPostion.M2)
                    state = 4
                    basic.showIcon(IconNames.SmallSquare, 0)
                    serial.writeLine("LAT_DONE: motors stopped")
                    return
                }
                trial++
                let cueDirection = trial % 2 == 1 ? 1 : -1
                basic.showArrow(cueDirection > 0 ? ArrowNames.North : ArrowNames.South, 0)
                let cueTime = input.runningTime()
                serial.writeLine("LAT_CUE," + trial + "," + cueTime + "," + cueDirection + "," + lastRawLeft)
                nextCue = cueTime + Math.randomRange(3000, 4500)
            }
            let readStarted = input.runningTime()
            let left = ps2Probe.readByte(PlanetX_Basic.value_A.LY)
            let leftSeen = input.runningTime()
            lastRawLeft = left
            let right = -1
            if (left >= 0) right = ps2Probe.readByte(PlanetX_Basic.value_A.RX)
            let readDuration = input.runningTime() - readStarted
            if (left < 0 || right < 0) {
                state = 3
                // Best effort: a native I2C stall can prevent this code being reached.
                nezhaV2.stop(nezhaV2.MotorPostion.M1)
                nezhaV2.stop(nezhaV2.MotorPostion.M2)
                basic.showIcon(IconNames.No)
                serial.writeLine("BENCH: receiver fault; polling stopped. Restart with sticks centered to retry.")
                return
            }
            let drive = carControls.drivePercent(carControls.axis(left, 0, 128, 255, deadZone, invertDrive), driveCap)
            let steering = Math.round(carControls.axis(right, 0, 128, 255, deadZone, invertSteering) * steeringTravel)
            if (state == 1) {
                if (Math.abs(left - 128) <= deadZone && Math.abs(right - 128) <= deadZone) neutralSamples++
                else neutralSamples = 0
                if (neutralSamples >= 3) {
                    // Reads the current encoder position; no homing or zero/reset command.
                    center = latencyTest ? 0 : nezhaV2.readAbsAngle(nezhaV2.MotorPostion.M2)
                    // Angle-motion speed is separate from M1's continuous start command.
                    if (!latencyTest) nezhaV2.setServoSpeed(steeringSpeed)
                    state = 2
                    lastDrive = 999
                    lastSteering = 999
                    lastTimingReport = 0
                    maxCycleInterval = 0
                    maxReadDuration = 0
                    maxCommandDuration = 0
                    basic.showIcon(IconNames.Yes)
                    serial.writeValue("steering_center_deg", center)
                    serial.writeLine("BENCH: ACTIVE; left Y drive, right X steering; power switch stops")
                    if (latencyTest) {
                        basic.showString("L", 500)
                        basic.showArrow(ArrowNames.North, 0)
                        serial.writeLine("LAT_READY: first LEFT-stick forward starts warm-up; then follow arrows and hold until next cue. Automatic stop at end.")
                    }
                    previousCycle = 0
                } else if (input.runningTime() - lastTimingReport >= 1000) {
                    serial.writeLine("BENCH: waiting for centered sticks")
                    serial.writeValue("leftY_raw", left)
                    serial.writeValue("rightX_raw", right)
                    lastTimingReport = input.runningTime()
                }
                basic.pause(100)
                return
            }
            // First correct stick movement starts the test; readiness wait is not timed.
            if (latencyTest && trial == 0) {
                if (drive > 0) {
                    trial = 1
                    serial.writeLine("LAT_WARMUP,1," + leftSeen + ",1,128")
                    nextCue = input.runningTime() + Math.randomRange(3000, 4500)
                } else drive = 0
            }
            let inputSeen = input.runningTime()
            let changed = drive != lastDrive || steering != lastSteering
            let commandStarted = input.runningTime()
            if (drive != lastDrive) {
                // Non-blocking receipt indicator: top forward, bottom reverse, middle neutral.
                if (!latencyTest) {
                    basic.clearScreen()
                    led.plot(2, drive > 0 ? 0 : drive < 0 ? 4 : 2)
                }
                if (drive == 0) nezhaV2.stop(nezhaV2.MotorPostion.M1)
                else nezhaV2.start(nezhaV2.MotorPostion.M1, drive)
                lastDrive = drive
            }
            let driveCommandReturned = input.runningTime()
            // Only appropriate for loose motors: shortest-path modulo positioning.
            if (!latencyTest && steering != lastSteering) {
                let target = (Math.round(center + steering) + 360) % 360
                nezhaV2.moveToAbsAngle(nezhaV2.MotorPostion.M2, nezhaV2.ServoMotionMode.ShortPath,
                    target, nezhaV2.DelayMode.NoDelay)
                lastSteering = steering
            }
            let commandDuration = input.runningTime() - commandStarted
            if (latencyTest) {
                let angle = nezhaV2.readAngle(nezhaV2.MotorPostion.M1)
                serial.writeLine("LAT_SAMPLE," + trial + "," + leftSeen + "," + left + "," + drive + "," + driveCommandReturned + "," + input.runningTime() + "," + angle)
                lastSteering = steering
            }
            maxCycleInterval = Math.max(maxCycleInterval, cycleInterval)
            maxReadDuration = Math.max(maxReadDuration, readDuration)
            maxCommandDuration = Math.max(maxCommandDuration, commandDuration)
            // Log after commanding motors so UART backpressure cannot delay this command.
            if (changed) {
                serial.writeValue("input_seen_ms", inputSeen)
                serial.writeValue("drive_command_returned_ms", driveCommandReturned)
                serial.writeValue("leftY_raw", left)
                serial.writeValue("rightX_raw", right)
                serial.writeValue("drive_pct", drive)
                serial.writeValue("steering_offset_deg", steering)
            }
            if (input.runningTime() - lastTimingReport >= 1000) {
                serial.writeValue("cycle_interval_ms", cycleInterval)
                serial.writeValue("receiver_read_ms", readDuration)
                serial.writeValue("motor_command_ms", commandDuration)
                serial.writeValue("max_cycle_interval_ms", maxCycleInterval)
                serial.writeValue("max_receiver_read_ms", maxReadDuration)
                serial.writeValue("max_motor_command_ms", maxCommandDuration)
                lastTimingReport = input.runningTime()
                maxCycleInterval = 0
                maxReadDuration = 0
                maxCommandDuration = 0
            }
            basic.pause(controlPauseMs)
        })
    }
}

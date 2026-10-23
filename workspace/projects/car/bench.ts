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
        // 1 waiting for neutral, 2 active, 3 receiver fault (restart to retry).
        let state = 1
        let neutralSamples = 0
        let center = 0
        let lastDrive = 999
        let lastSteering = 999
        let previousCycle = 0
        let lastTimingReport = 0
        // Nezha can keep running across a micro:bit reset: request stops first.
        nezhaV2.stop(nezhaV2.MotorPostion.M1)
        nezhaV2.stop(nezhaV2.MotorPostion.M2)
        basic.showIcon(IconNames.SmallSquare)
        serial.writeLine("BENCH: loose motors only. M1 drive, M2 steering, receiver IIC. Center sticks to start; no buttons. Power switch stops. Radio freshness UNKNOWN.")

        basic.forever(function () {
            let cycleStarted = input.runningTime()
            let cycleInterval = previousCycle == 0 ? 0 : cycleStarted - previousCycle
            previousCycle = cycleStarted
            if (state == 3) {
                if (input.runningTime() - lastTimingReport >= 1000) {
                    serial.writeLine("BENCH: receiver fault; restart to retry")
                    lastTimingReport = input.runningTime()
                }
                basic.pause(100)
                return
            }
            let readStarted = input.runningTime()
            let left = ps2Probe.readByte(PlanetX_Basic.value_A.LY)
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
                    center = nezhaV2.readAbsAngle(nezhaV2.MotorPostion.M2)
                    // Angle-motion speed is separate from M1's continuous start command.
                    nezhaV2.setServoSpeed(steeringSpeed)
                    state = 2
                    lastDrive = 999
                    lastSteering = 999
                    lastTimingReport = 0
                    basic.showIcon(IconNames.Yes)
                    serial.writeValue("steering_center_deg", center)
                    serial.writeLine("BENCH: ACTIVE; left Y drive, right X steering; power switch stops")
                } else if (input.runningTime() - lastTimingReport >= 1000) {
                    serial.writeLine("BENCH: waiting for centered sticks")
                    serial.writeValue("leftY_raw", left)
                    serial.writeValue("rightX_raw", right)
                    lastTimingReport = input.runningTime()
                }
                basic.pause(100)
                return
            }
            if (drive != lastDrive || steering != lastSteering) {
                serial.writeValue("input_seen_ms", input.runningTime())
                serial.writeValue("leftY_raw", left)
                serial.writeValue("rightX_raw", right)
                serial.writeValue("drive_pct", drive)
                serial.writeValue("steering_offset_deg", steering)
            }
            let commandStarted = input.runningTime()
            if (drive != lastDrive) {
                if (drive == 0) nezhaV2.stop(nezhaV2.MotorPostion.M1)
                else nezhaV2.start(nezhaV2.MotorPostion.M1, drive)
                lastDrive = drive
            }
            // Only appropriate for loose motors: shortest-path modulo positioning.
            if (steering != lastSteering) {
                let target = (Math.round(center + steering) + 360) % 360
                nezhaV2.moveToAbsAngle(nezhaV2.MotorPostion.M2, nezhaV2.ServoMotionMode.ShortPath,
                    target, nezhaV2.DelayMode.NoDelay)
                lastSteering = steering
            }
            let commandDuration = input.runningTime() - commandStarted
            if (input.runningTime() - lastTimingReport >= 1000) {
                serial.writeValue("cycle_interval_ms", cycleInterval)
                serial.writeValue("receiver_read_ms", readDuration)
                serial.writeValue("motor_command_ms", commandDuration)
                lastTimingReport = input.runningTime()
            }
            basic.pause(controlPauseMs)
        })
    }
}

/** Supervised loose-motor test, NOT calibrated for a chassis or steering linkage. */
namespace car {
    // Bench settings: measured axes 0/128/255, provisional dead zone 8.
    const driveCap = 20
    const driveStepDegrees = 20
    const steeringTravel = 45
    const deadZone = 8
    const invertDrive = true
    const invertSteering = false

    //% blockId=car_start_controller_bench block="start controller bench (loose motors only)"
    export function startControllerBench() {
        // 0 disarmed, 1 waiting for neutral, 2 armed, 3 receiver fault.
        let state = 0
        let neutralSamples = 0
        let center = 0
        let outputsPending = false
        let lastDrive = 999
        let lastSteering = 999
        basic.showIcon(IconNames.SmallSquare)
        serial.writeLine("BENCH: loose motors only. M1 drive, M2 steering, receiver IIC. A arms from neutral; B disarms. Radio freshness UNKNOWN.")

        // A function-valued local is captured correctly by this pinned PXT compiler.
        // A nested function declaration was emitted as an out-of-scope stack read
        // in the forever callback and caused native panic 980 on startup.
        let stopOutputs = function () {
            if (outputsPending) {
                nezhaV2.stop(nezhaV2.MotorPostion.M1)
                nezhaV2.stop(nezhaV2.MotorPostion.M2)
                outputsPending = false
            }
        }

        input.onButtonPressed(Button.A, function () {
            if (state == 2) return
            state = 1
            neutralSamples = 0
            basic.showIcon(IconNames.SmallSquare)
            serial.writeLine("BENCH: waiting for both sticks centered")
        })
        input.onButtonPressed(Button.B, function () {
            state = 0
            neutralSamples = 0
            basic.showIcon(IconNames.SmallSquare)
            serial.writeLine("BENCH: disarm requested; physical power-off remains available")
        })

        basic.forever(function () {
            // End the previous pulse BEFORE another potentially blocking receiver read.
            // Commands themselves specify finite angles if this fiber cannot run again.
            stopOutputs()
            if (state == 0 || state == 3) {
                basic.pause(100)
                return
            }
            let left = ps2Probe.readByte(PlanetX_Basic.value_A.LY)
            let right = -1
            if (left >= 0) right = ps2Probe.readByte(PlanetX_Basic.value_A.RX)
            // A button event may have disarmed during a yielding read.
            if (state == 0) return
            if (left < 0 || right < 0) {
                state = 3
                basic.showIcon(IconNames.No)
                serial.writeLine("BENCH: receiver fault; polling stopped. A retries from neutral.")
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
                    if (state != 1) return
                    state = 2
                    lastDrive = 999
                    lastSteering = 999
                    basic.showIcon(IconNames.Yes)
                    serial.writeValue("steering_center_deg", center)
                    serial.writeLine("BENCH: ARMED; left Y drive, right X steering; B disarms")
                }
                basic.pause(100)
                return
            }
            if (drive != lastDrive || steering != lastSteering) {
                serial.writeValue("drive_pct", drive)
                serial.writeValue("steering_offset_deg", steering)
                lastDrive = drive
                lastSteering = steering
            }
            // Vendor speed setting is shared: set once per cycle, not per motor.
            // Steering consequently slows with small nonzero drive demand.
            nezhaV2.setServoSpeed(drive == 0 ? 15 : Math.abs(drive))
            if (state != 2) return
            outputsPending = true
            if (drive != 0) {
                nezhaV2.__move(nezhaV2.MotorPostion.M1,
                    drive > 0 ? nezhaV2.MovementDirection.CW : nezhaV2.MovementDirection.CCW,
                    driveStepDegrees, nezhaV2.SportsMode.Degree)
            }
            if (state != 2) {
                stopOutputs()
                return
            }
            // Only appropriate for loose motors: shortest-path modulo positioning.
            let target = (Math.round(center + steering) + 360) % 360
            nezhaV2.moveToAbsAngle(nezhaV2.MotorPostion.M2, nezhaV2.ServoMotionMode.ShortPath,
                target, nezhaV2.DelayMode.NoDelay)
            basic.pause(100)
        })
    }
}

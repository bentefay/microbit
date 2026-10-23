/** Normal driving. Diagnostic cue tests remain separately selectable in bench.ts. */
namespace car {
    //% blockId=car_start_driving block="start car with joystick display"
    export function startDriving() {
        // 0 waiting for neutral, 1 active, 2 latched receiver fault, 3 invalid settings.
        let state = 0
        let selectedStick = 0
        let neutralSamples = 0
        let center = carSettings.steeringCenterDegrees
        let leftLimit = carSettings.steeringLeftDegrees
        let rightLimit = carSettings.steeringRightDegrees
        let lastDrive = 999
        let lastTarget = -1
        let lastReport = 0
        let previousCycle = 0
        let maxCycleMs = 0
        let maxReadMs = 0

        nezhaV2.stop(carSettings.drivePort)
        nezhaV2.stop(carSettings.steeringPort)
        basic.showIcon(IconNames.SmallSquare, 0)
        if (!carSettings.looseMotorBench && (!carSettings.steeringCalibrated ||
            !carControls.validSteeringLimits(leftLimit, center, rightLimit))) {
            state = 3
            basic.showIcon(IconNames.No, 0)
            serial.writeLine("CAR: measured steering limits required; motors stopped")
        }
        input.onButtonPressed(Button.A, function () { selectedStick = 0 })
        input.onButtonPressed(Button.B, function () { selectedStick = 1 })
        serial.writeLine("CAR: center drive/steering sticks to start. A displays left stick; B displays right. Power switch stops. Radio freshness unknown.")

        // Function-valued locals avoid the pinned compiler's nested-declaration capture bug.
        let receiverFault = function () {
            state = 2
            nezhaV2.stop(carSettings.drivePort)
            nezhaV2.stop(carSettings.steeringPort)
            basic.showIcon(IconNames.No, 0)
            serial.writeLine("CAR: receiver read failed; motors stopped if I2C accepted stops; reset to retry")
        }

        basic.forever(function () {
            let cycleStart = input.runningTime()
            if (previousCycle > 0) maxCycleMs = Math.max(maxCycleMs, cycleStart - previousCycle)
            previousCycle = cycleStart
            if (state >= 2) {
                basic.pause(100)
                return
            }
            // Read/control the two driving axes first. Extra display data follows commands.
            let ly = ps2Probe.readByte(PlanetX_Basic.value_A.LY)
            let rx = ly < 0 ? -1 : ps2Probe.readByte(PlanetX_Basic.value_A.RX)
            maxReadMs = Math.max(maxReadMs, input.runningTime() - cycleStart)
            if (ly < 0 || rx < 0) {
                receiverFault()
                return
            }
            let driveAxis = carControls.axis(ly, 0, 128, 255, carSettings.deadZone, carSettings.invertDrive)
            let steerAxis = carControls.axis(rx, 0, 128, 255, carSettings.deadZone, carSettings.invertSteering)
            if (state == 0) {
                if (Math.abs(ly - 128) <= carSettings.deadZone && Math.abs(rx - 128) <= carSettings.deadZone) neutralSamples++
                else neutralSamples = 0
                if (neutralSamples >= 3) {
                    if (carSettings.looseMotorBench) {
                        center = nezhaV2.readAbsAngle(carSettings.steeringPort)
                        leftLimit = center - carSettings.benchTravelDegrees
                        rightLimit = center + carSettings.benchTravelDegrees
                    }
                    nezhaV2.setServoSpeed(carSettings.steeringSpeedPercent)
                    state = 1
                    serial.writeValue("steering_center_deg", center)
                    serial.writeLine("CAR: active")
                }
            } else {
                let drive = carControls.drivePercent(driveAxis, carSettings.driveCapPercent)
                let angle = carControls.steeringPosition(steerAxis, leftLimit, center, rightLimit)
                let target = ((Math.round(angle) % 360) + 360) % 360
                if (drive != lastDrive) {
                    if (drive == 0) nezhaV2.stop(carSettings.drivePort)
                    else nezhaV2.start(carSettings.drivePort, drive)
                    lastDrive = drive
                }
                if (target != lastTarget) {
                    nezhaV2.moveToAbsAngle(carSettings.steeringPort, nezhaV2.ServoMotionMode.ShortPath, target, nezhaV2.DelayMode.NoDelay)
                    lastTarget = target
                }
            }

            // Snapshot selection because button events may run during a yielding read.
            let stick = selectedStick
            let extraStarted = input.runningTime()
            let extra = ps2Probe.readByte(stick == 0 ? PlanetX_Basic.value_A.LX : PlanetX_Basic.value_A.RY)
            maxReadMs = Math.max(maxReadMs, input.runningTime() - extraStarted)
            if (extra < 0) {
                receiverFault()
                return
            }
            let x = carControls.axis(stick == 0 ? extra : rx, 0, 128, 255, carSettings.deadZone,
                stick == 0 ? carSettings.displayInvertLX : carSettings.displayInvertRX)
            let y = carControls.axis(stick == 0 ? ly : extra, 0, 128, 255, carSettings.deadZone,
                stick == 0 ? carSettings.displayInvertLY : carSettings.displayInvertRY)
            joystickDisplay.draw(x, y)
            if (carSettings.serialDiagnostics && input.runningTime() - lastReport >= 1000) {
                serial.writeLine("CAR_STATE," + state + "," + stick + "," + ly + "," + rx + "," + extra + "," + lastDrive + "," + lastTarget + "," + maxCycleMs + "," + maxReadMs)
                lastReport = input.runningTime()
                maxCycleMs = 0
                maxReadMs = 0
            }
            basic.pause(carSettings.loopPauseMs)
        })
    }
}

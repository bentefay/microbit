/** Motor-stopped, full-rate comparison of documented axis reads and timing variants. */
namespace car {
    //% blockId=car_start_receiver_lab block="investigate joystick receiver (motors stopped)"
    export function startReceiverLab() {
        nezhaV2.stop(carSettings.drivePort)
        nezhaV2.stop(carSettings.steeringPort)
        // The Docker logger handles arbitrary chunks; it does not need 32-byte line padding.
        serial.setWriteLinePadding(0)
        let profile = 0
        let sequence = 0
        let fault = false
        // A advances profiles. B returns to the baseline. Neither starts a motor.
        input.onButtonPressed(Button.A, function () { profile = (profile + 1) % 6 })
        input.onButtonPressed(Button.B, function () { profile = 0 })
        serial.writeLine("RX_LAB: motors stopped. A: next profile 0..5; B: baseline. Reset required after a read fault.")
        basic.forever(function () {
            if (fault) { basic.pause(100); return }
            let p = profile
            let settle = p == 2 ? 2 : p == 3 ? 10 : 0
            let pause = p == 4 ? 80 : 20
            // 0 matches the car's three-axis order; 1 omits RX; 5 reverses LX/LY.
            let commands = p == 0 ? [28, 25, 27] : p == 5 ? [27, 28] : [28, 27]
            let x = -1
            let y = -1
            let rx = -1
            let records: string[] = []
            let started = input.runningTime()
            sequence++
            for (let i = 0; i < commands.length; i++) {
                let before = input.runningTime()
                let value = ps2Probe.readWithDelay(commands[i], settle)
                let after = input.runningTime()
                records.push("RX_READ," + sequence + "," + p + "," + commands[i] + "," + before + "," + after + "," + value + "," + ps2Probe.metrics.join(","))
                if (value < 0) { fault = true; break }
                if (commands[i] == 27) x = value
                if (commands[i] == 28) y = value
                if (commands[i] == 25) rx = value
            }
            let finished = input.runningTime()
            if (fault) basic.showIcon(IconNames.No, 0)
            else joystickDisplay.draw(
                carControls.axis(x, 0, 128, 255, carSettings.deadZone, carSettings.displayInvertLX),
                carControls.axis(y, 0, 128, 255, carSettings.deadZone, carSettings.displayInvertLY))
            // Output only after the full axis sequence; never between write and response.
            for (let i = 0; i < records.length; i++) serial.writeLine(records[i])
            serial.writeLine("RX_FRAME," + sequence + "," + p + "," + started + "," + finished + "," + x + "," + y + "," + rx)
            if (fault) serial.writeLine("RX_FAULT: polling latched off; reset to retry")
            basic.pause(pause)
        })
    }
}

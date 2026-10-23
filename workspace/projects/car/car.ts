/** Car commissioning. No motor commands. IIC diagnostics require pressing A+B. */
//% color=#267f99 icon="\uf1b9" block="Car"
namespace car {
    //% blockId=car_start_commissioning block="start car commissioning (motors disabled)"
    export function startCommissioning() {
        let logging = false
        let fault = false
        basic.showIcon(IconNames.Yes)
        serial.writeLine("CAR: commissioning firmware; motors disabled")
        input.onButtonPressed(Button.A, function () {
            basic.showString("ELI")
        })
        input.onButtonPressed(Button.B, function () {
            basic.showIcon(IconNames.Yes)
            serial.writeLine("CAR: ready for wiring and controller calibration")
        })
        input.onButtonPressed(Button.AB, function () {
            logging = !logging
            fault = false
            basic.showIcon(IconNames.Yes)
            serial.writeLine(logging ? "PS2: input logging enabled; radio freshness UNKNOWN" : "PS2: logging stopped")
        })
        basic.forever(function () {
            if (logging) {
                let left = ps2Probe.readByte(PlanetX_Basic.value_A.LY)
                let right = -1
                if (left >= 0) right = ps2Probe.readByte(PlanetX_Basic.value_A.RX)
                serial.writeValue("leftY_raw", left)
                serial.writeValue("rightX_raw", right)
                if (left < 0 || right < 0) {
                    logging = false
                    fault = true
                    basic.showIcon(IconNames.No)
                    serial.writeLine("PS2: read failed; polling stopped. Check receiver; A+B retries. Motors disabled.")
                }
            }
            basic.pause(100)
        })
        basic.forever(function () {
            basic.pause(5000)
            serial.writeLine(fault ? "CAR: heartbeat; receiver fault; polling stopped" : logging ? "CAR: heartbeat; reading inputs" : "CAR: heartbeat; input logging off")
        })
    }
}

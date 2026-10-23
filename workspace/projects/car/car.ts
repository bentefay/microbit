/** Car commissioning. No motor commands. IIC diagnostics require pressing A+B. */
//% color=#267f99 icon="\uf1b9" block="Car"
namespace car {
    //% blockId=car_start_commissioning block="start car commissioning (motors disabled)"
    export function startCommissioning() {
        let logging = false
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
            serial.writeLine(logging ? "PS2: input logging enabled; radio freshness UNKNOWN" : "PS2: logging stopped")
        })
        basic.forever(function () {
            if (logging) {
                serial.writeValue("leftY_raw", ps2Probe.readByte(PlanetX_Basic.value_A.LY))
                serial.writeValue("rightX_raw", ps2Probe.readByte(PlanetX_Basic.value_A.RX))
            }
            basic.pause(100)
        })
    }
}

// Loose-motor bench test only. Receiver disconnected; no wheels/linkage attached.
// This sends a finite relative-angle request to Nezha, not an open-ended start.
let testPort = nezhaV2.MotorPostion.M1
let busy = false
basic.showIcon(IconNames.SmallSquare)
serial.writeLine("MOTOR TEST: M1; 20 degrees at 15 percent; A forward, B reverse. No startup motion.")

function jog(direction: nezhaV2.MovementDirection) {
    if (busy) return
    busy = true
    serial.writeLine("MOTOR TEST: finite 20 degree command")
    nezhaV2.move(testPort, 15, direction, 20, nezhaV2.SportsMode.Degree, nezhaV2.DelayMode.NoDelay)
    // Nezha receives the finite target; this is an additional stop, not its timer.
    basic.pause(1000)
    nezhaV2.stop(testPort)
    serial.writeLine("MOTOR TEST: extra stop sent; visually confirm motor is stationary")
    busy = false
}

input.onButtonPressed(Button.A, function () {
    jog(nezhaV2.MovementDirection.CW)
})
input.onButtonPressed(Button.B, function () {
    jog(nezhaV2.MovementDirection.CCW)
})
input.onButtonPressed(Button.AB, function () {
    nezhaV2.stop(testPort)
    serial.writeLine("MOTOR TEST: stop requested")
})

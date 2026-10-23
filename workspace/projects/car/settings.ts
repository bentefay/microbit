/** User-adjustable settings. Motor angles are shaft angles, not wheel angles. */
namespace carSettings {
    export const drivePort = nezhaV2.MotorPostion.M1
    export const steeringPort = nezhaV2.MotorPostion.M2
    export const driveCapPercent = 20
    export const steeringSpeedPercent = 15
    export const deadZone = 8
    export const loopPauseMs = 20
    export const invertDrive = true // Measured: left Y = 0 when pushed forward.
    export const invertSteering = false

    // The current hardware has loose motors. Do not attach a linkage with this true.
    export const looseMotorBench = true
    export const benchTravelDegrees = 45
    // For a built car: set looseMotorBench=false and enter measured motor coordinates.
    // Use unwrapped coordinates (e.g. 325, 350, 375 crosses the zero boundary).
    export const steeringCalibrated = false
    export const steeringLeftDegrees = 0
    export const steeringCenterDegrees = 0
    export const steeringRightDegrees = 0

    // Display axes, separate from motor inversion. LX/RY orientation needs checking.
    export const displayInvertLX = false
    export const displayInvertLY = true
    export const displayInvertRX = false
    export const displayInvertRY = true
    // 0: blended dot (recommended), 1: coarse/fine rings, 2: aligned polar rings.
    export const displayStyle = 0
    export const serialDiagnostics = true
}

/** Pure control mapping. These functions never read hardware or command motors. */
namespace carControls {
    /** Calibrate low/center/high from raw receiver bytes before use. */
    export function axis(raw: number, low: number, center: number, high: number, deadZone: number, inverted: boolean): number {
        if (deadZone < 0 || low >= center - deadZone || high <= center + deadZone) return 0
        let offset = raw - center
        let output = 0
        if (offset > deadZone) output = (offset - deadZone) / (high - center - deadZone)
        if (offset < -deadZone) output = (offset + deadZone) / (center - low - deadZone)
        output = Math.max(-1, Math.min(1, output))
        return inverted ? -output : output
    }

    export function drivePercent(normalized: number, speedCap: number): number {
        return Math.round(Math.max(-1, Math.min(1, normalized)) * Math.max(0, Math.min(100, speedCap)))
    }

    /** Measured, unwrapped motor coordinates; do not pass blindly to modulo-360 APIs. */
    export function steeringPosition(normalized: number, left: number, center: number, right: number): number {
        normalized = Math.max(-1, Math.min(1, normalized))
        return normalized < 0 ? center + (-normalized) * (left - center) : center + normalized * (right - center)
    }
}

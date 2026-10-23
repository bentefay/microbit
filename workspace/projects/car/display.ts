/** Pure frame generation keeps the visualization testable independently of hardware. */
namespace joystickDisplay {
    export function frame(x: number, y: number, style: number, brightRadius: boolean): number[] {
        x = Math.max(-1, Math.min(1, x))
        y = Math.max(-1, Math.min(1, y))
        let pixels: number[] = []
        for (let i = 0; i < 25; i++) pixels.push(0)
        if (style == 0) {
            // Bilinear blending lights only the joystick position and its neighbors.
            let px = 2 + 2 * x
            let py = 2 - 2 * y
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 5; col++) {
                    let weight = Math.max(0, 1 - Math.abs(col - px)) * Math.max(0, 1 - Math.abs(row - py))
                    pixels[row * 5 + col] = Math.round(255 * weight)
                }
            }
            return pixels
        }
        let radius = Math.min(1, Math.sqrt(x * x + y * y))
        let angle = radius == 0 ? 0 : Math.atan2(x, y)
        if (angle < 0) angle += 2 * Math.PI
        let outer = [2, 3, 4, 9, 14, 19, 24, 23, 22, 21, 20, 15, 10, 5, 0, 1]
        let inner = [7, 8, 13, 18, 17, 16, 11, 6]
        // 9*k mod 8 == k: all eight compass directions align on both rings.
        let fineMultiplier = style == 1 ? 9 : 1
        let outerIndex = Math.round(angle * 16 / (2 * Math.PI)) % 16
        let innerIndex = Math.round(angle * 8 * fineMultiplier / (2 * Math.PI)) % 8
        if (style == 2) {
            pixels[12] = 128
            if (radius > 0) {
                let brightness = Math.round(32 + 223 * radius)
                pixels[outer[outerIndex]] = brightness
                pixels[inner[innerIndex]] = brightness
            }
            return pixels
        }
        pixels[12] = 128
        pixels[outer[outerIndex]] = 128
        pixels[inner[innerIndex]] = 128
        // Separate radius marker pulses in brightness; direction LEDs remain lit on overlap.
        let radiusIndex = (4 - Math.round(4 * radius)) * 5 + 4
        pixels[radiusIndex] = brightRadius ? 255 : Math.max(pixels[radiusIndex], 32)
        return pixels
    }

    export function draw(x: number, y: number) {
        let pixels = frame(x, y, carSettings.displayStyle, input.runningTime() % 600 < 300)
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) led.plotBrightness(col, row, pixels[row * 5 + col])
        }
    }
}

/**
 * PS2 IIC diagnostic adapted from the pinned PlanetX basic.ts protocol.
 * Unlike GetAnalogValue/get_Attention_Value, readiness polling yields and stops.
 * Returns raw bytes (no vendor +1 / x4 transforms); -1 means readiness timeout.
 * The timeout cannot interrupt one underlying runtime I2C call. Measure on hardware.
 * Readiness and valid bytes do NOT establish fresh wireless data.
 */
namespace ps2Probe {
    export function readByte(command: number): number {
        let started = input.runningTime()
        // Both elapsed time and attempt count bound our readiness loop.
        for (let attempt = 0; attempt < 16; attempt++) {
            if (input.runningTime() - started >= 20) return -1
            if (pins.i2cReadNumber(0x08, NumberFormat.UInt8LE, false) == 0x10) {
                pins.i2cWriteNumber(0x08, command, NumberFormat.UInt8LE, false)
                return pins.i2cReadNumber(0x08, NumberFormat.UInt8LE, false)
            }
            basic.pause(1)
        }
        return -1
    }
}

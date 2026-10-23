/**
 * PS2 IIC diagnostic adapted from the pinned PlanetX basic.ts protocol.
 * Unlike GetAnalogValue/get_Attention_Value, readiness polling yields and stops.
 * Raw bytes; -1 readiness timeout, -2 native read error, -3 native write error.
 * The timeout cannot interrupt one underlying runtime I2C call. Measure on hardware.
 * Readiness and valid bytes do NOT establish fresh wireless data.
 */
namespace ps2Probe {
    // Last operation: attempts, first/last readiness byte, readiness/write/data ms, native status.
    export let metrics: number[] = []

    export function readByte(command: number): number {
        return readWithDelay(command, 0)
    }

    // Delay is an explicit diagnostic variable, not an assumed protocol requirement.
    export function readWithDelay(command: number, settleMs: number): number {
        let started = input.runningTime()
        metrics = [0, -1, -1, 0, 0, 0, 0]
        // Both elapsed time and attempt count bound our readiness loop.
        for (let attempt = 0; attempt < 16; attempt++) {
            metrics[3] = input.runningTime() - started
            if (metrics[3] >= 20) return -1
            let ready = ps2Transport.read()
            metrics[0]++
            if (attempt == 0) metrics[1] = ready
            metrics[2] = ready
            metrics[3] = input.runningTime() - started
            metrics[6] = ps2Transport.status()
            if (ready < 0) return -2
            if (ready == 0x10) {
                let writing = input.runningTime()
                let status = ps2Transport.write(command)
                metrics[4] = input.runningTime() - writing
                metrics[6] = status
                if (status != 0) return -3
                if (settleMs > 0) basic.pause(settleMs)
                let reading = input.runningTime()
                let value = ps2Transport.read()
                metrics[5] = input.runningTime() - reading
                metrics[6] = ps2Transport.status()
                return value
            }
            basic.pause(1)
        }
        metrics[3] = input.runningTime() - started
        return -1
    }
}

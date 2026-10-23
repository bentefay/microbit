/** Simulator stubs fail closed. Real implementations are in receiver-transport.cpp. */
namespace ps2Transport {
    //% shim=ps2Transport::read
    export function read(): number { return -2 }
    //% shim=ps2Transport::write
    export function write(command: number): number { return -3 }
    //% shim=ps2Transport::status
    export function status(): number { return -1 }
}

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';

test('receiver lab only stops motors; profiles isolate timing/order and faults latch', () => {
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(join(root, 'workspace/projects/car/receiver-lab.ts'), 'utf8'));
  const motor: number[] = [], reads: number[][] = [], pauses: number[] = [], logs: string[] = [];
  const buttons: Record<number, () => void> = {};
  let loop = () => {}, fail = false;
  const car = new Function('nezhaV2', 'carSettings', 'input', 'Button', 'serial', 'basic', 'IconNames', 'ps2Probe', 'joystickDisplay', 'carControls', js + '\nreturn car;')(
    { stop: (port: number) => motor.push(port) }, { drivePort: 1, steeringPort: 2, deadZone: 8 },
    { onButtonPressed: (b: number, fn: () => void) => buttons[b] = fn, runningTime: () => 100 }, { A: 0, B: 1 },
    { writeLine: (s: string) => logs.push(s), setWriteLinePadding() {} },
    { forever: (fn: () => void) => loop = fn, pause: (ms: number) => pauses.push(ms), showIcon() {} }, { No: 0 },
    { metrics: [1, 16, 16, 1, 1, 1, 0], readWithDelay: (command: number, delay: number) => { reads.push([command, delay]); return fail ? -2 : 128; } },
    { draw() {} }, { axis: () => 0 });
  car.startReceiverLab();
  const expected = [ [[28,0],[25,0],[27,0]], [[28,0],[27,0]], [[28,2],[27,2]],
    [[28,10],[27,10]], [[28,0],[27,0]], [[27,0],[28,0]] ];
  for (let p = 0; p < 6; p++) {
    reads.length = 0; loop(); expect(reads).toEqual(expected[p]);
    expect(pauses.at(-1)).toBe(p === 4 ? 80 : 20);
    expect(logs.at(-1)).toStartWith(`RX_FRAME,${p + 1},${p},`);
    buttons[0]();
  }
  expect(motor).toEqual([1, 2]);
  fail = true; loop(); reads.length = 0; fail = false; buttons[1](); loop();
  expect(reads).toEqual([]);
  expect(motor).toEqual([1, 2]);
});

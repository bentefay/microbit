import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';
const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(join(root, 'workspace/projects/car/receiver.ts'), 'utf8'));
function probe(readings: number[]) {
  let elapsed = 0, reads = 0, pauses = 0;
  const writes: number[][] = [];
  const pins = {
    i2cReadNumber: () => { reads++; return readings.shift() || 0; },
    i2cWriteNumber: (...args: number[]) => writes.push(args),
  };
  const receiver = new Function('input', 'pins', 'basic', 'NumberFormat', js + '\nreturn ps2Probe;')(
    { runningTime: () => elapsed }, pins,
    { pause: (ms: number) => { elapsed += ms; pauses++; } }, { UInt8LE: 0 });
  return { receiver, writes, stats: () => ({ reads, pauses }) };
}
test('unready receiver yields and returns failure without writing a command', () => {
  const p = probe([]);
  expect(p.receiver.readByte(5)).toBe(-1);
  expect(p.writes).toEqual([]);
  expect(p.stats()).toEqual({ reads: 16, pauses: 16 });
});
test('ready receiver preserves raw zero and nonzero readings', () => {
  const p = probe([0, 0x10, 200, 0x10, 0]);
  expect(p.receiver.readByte(5)).toBe(200);
  expect(p.receiver.readByte(6)).toBe(0);
  expect(p.writes.map(w => w.slice(0, 2))).toEqual([[8, 5], [8, 6]]);
});

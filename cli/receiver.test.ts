import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';
const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(join(root, 'workspace/projects/car/receiver.ts'), 'utf8'));
function probe(readings: number[], writeStatus = 0, readCost = 0) {
  let elapsed = 0, reads = 0, pauses = 0;
  const writes: number[][] = [];
  let lastStatus = 0;
  const transport = {
    read: () => { reads++; elapsed += readCost; const value = readings.shift() ?? 0; lastStatus = value < 0 ? -1010 : 0; return value; },
    write: (command: number) => { writes.push([8, command]); return writeStatus; },
    status: () => lastStatus,
  };
  const receiver = new Function('input', 'ps2Transport', 'basic', js + '\nreturn ps2Probe;')(
    { runningTime: () => elapsed }, transport,
    { pause: (ms: number) => { elapsed += ms; pauses++; } });
  return { receiver, writes, stats: () => ({ reads, pauses }), time: () => elapsed };
}
test('unready receiver yields and returns failure without writing a command', () => {
  const p = probe([]);
  expect(p.receiver.readByte(5)).toBe(-1);
  expect(p.writes).toEqual([]);
  expect(p.stats()).toEqual({ reads: 16, pauses: 16 });
});

test('bus errors never become valid axis zero or send a command after a failed readiness read', () => {
  const failedReady = probe([-2]);
  expect(failedReady.receiver.readByte(28)).toBe(-2);
  expect(failedReady.writes).toEqual([]);
  expect(failedReady.receiver.metrics[6]).toBe(-1010);
  const failedWrite = probe([16, 128], -1010);
  expect(failedWrite.receiver.readByte(28)).toBe(-3);
  expect(failedWrite.stats().reads).toBe(1);
  const failedData = probe([16, -2]);
  expect(failedData.receiver.readByte(28)).toBe(-2);
});

test('elapsed readiness deadline applies when individual calls take time', () => {
  const p = probe([0, 0, 0, 0], 0, 7);
  expect(p.receiver.readByte(28)).toBe(-1);
  expect(p.stats().reads).toBe(3);
  expect(p.writes).toEqual([]);
});

test('diagnostic delay is explicit and keeps readiness separate from the response byte', () => {
  const p = probe([16, 16], 0, 2);
  expect(p.receiver.readWithDelay(27, 10)).toBe(16); // 16 is also a legitimate axis value.
  expect(p.time()).toBe(14);
  expect(p.receiver.metrics).toEqual([1, 16, 16, 2, 0, 2, 0]);
});
test('ready receiver preserves raw zero and nonzero readings', () => {
  const p = probe([0, 0x10, 200, 0x10, 0]);
  expect(p.receiver.readByte(5)).toBe(200);
  expect(p.receiver.readByte(6)).toBe(0);
  expect(p.writes.map(w => w.slice(0, 2))).toEqual([[8, 5], [8, 6]]);
});

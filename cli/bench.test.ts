import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';

function bench() {
  const source = ['controls.ts', 'bench.ts'].map(file => readFileSync(join(root, 'workspace/projects/car', file), 'utf8')).join('\n');
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  const buttons: Record<string, () => void> = {};
  const calls: unknown[][] = [];
  const values: Record<string, number> = {};
  let now = 1000;
  let loop = () => {};
  let left = 128, right = 128;
  let duringRead: (() => void) | undefined;
  const car = new Function('basic', 'serial', 'input', 'Button', 'IconNames', 'ps2Probe', 'PlanetX_Basic', 'nezhaV2', js + '\nreturn car;')(
    { showIcon() {}, pause: (ms: number) => now += ms, forever: (f: () => void) => loop = f },
    { writeLine() {}, writeValue: (name: string, value: number) => values[name] = value },
    { runningTime: () => now, onButtonPressed: (button: string, f: () => void) => buttons[button] = f },
    { A: 'A', B: 'B' }, { SmallSquare: 0, Yes: 1, No: 2 },
    { readByte: (command: number) => { now += 3; calls.push(['read', command]); duringRead?.(); return command === 28 ? left : right; } },
    { value_A: { LY: 28, RX: 25 } },
    { MotorPostion: { M1: 1, M2: 2 }, MovementDirection: { CW: 1, CCW: 2 }, SportsMode: { Degree: 2 }, ServoMotionMode: { ShortPath: 1 }, DelayMode: { NoDelay: 0 },
      stop: (port: number) => calls.push(['stop', port]),
      readAbsAngle: () => { calls.push(['center']); return 350; },
      setServoSpeed: (value: number) => calls.push(['speed', value]),
      start: (...args: unknown[]) => calls.push(['drive', ...args]),
      moveToAbsAngle: (...args: unknown[]) => { now += 5; calls.push(['steer', ...args]); },
    });
  car.startControllerBench();
  return { buttons, calls, values, tick: () => loop(), axes: (l: number, r: number) => { left = l; right = r; },
    onRead: (f: () => void) => duringRead = f,
    start: () => { loop(); loop(); loop(); } };
}

test('controller bench automatically starts after three neutral samples with no buttons', () => {
  const b = bench();
  expect(b.calls).toEqual([['stop', 1], ['stop', 2]]);
  b.calls.length = 0;
  expect(b.buttons).toEqual({});
  b.axes(0, 128);
  for (let i = 0; i < 4; i++) b.tick();
  expect(b.calls.every(call => call[0] === 'read')).toBe(true);
  b.axes(128, 128);
  b.tick(); b.tick(); b.tick();
  expect(b.calls.slice(-2)).toEqual([['center'], ['speed', 15]]);
  expect(b.calls.some(call => call[0] === 'drive' || call[0] === 'steer')).toBe(false);
});

test('continuous drive updates only on change, stops at neutral, and steering is not repeatedly interrupted', () => {
  const b = bench();
  b.start();
  b.calls.length = 0;
  b.axes(0, 255); b.tick();
  expect(b.calls).toContainEqual(['drive', 1, 20]);
  expect(b.calls).toContainEqual(['steer', 2, 1, 35, 0]);
  b.calls.length = 0;
  b.tick();
  expect(b.calls).toEqual([['read', 28], ['read', 25]]);
  b.calls.length = 0;
  b.axes(255, 0); b.tick();
  expect(b.calls).toContainEqual(['drive', 1, -20]);
  expect(b.calls).toContainEqual(['steer', 2, 1, 305, 0]);
  b.calls.length = 0;
  b.axes(68, 128); b.tick();
  expect(b.calls).toContainEqual(['drive', 1, 9]);
  expect(b.calls).toContainEqual(['steer', 2, 1, 350, 0]);
  b.calls.length = 0;
  b.axes(128, 128); b.tick();
  expect(b.calls).toEqual([['read', 28], ['read', 25], ['stop', 1]]);
});

test('receiver failure stops pending motion and stays latched until firmware restarts', () => {
  const b = bench();
  b.start(); b.axes(0, 128); b.tick();
  b.calls.length = 0;
  b.axes(-1, 128); b.tick();
  expect(b.calls).toEqual([['read', 28], ['stop', 1], ['stop', 2]]);
  b.calls.length = 0;
  b.axes(128, 128); b.tick();
  expect(b.calls).toEqual([]);
  b.start();
  expect(b.calls).toEqual([]);
});

test('timing telemetry separates receiver reads and motor commands and reports observed raw values', () => {
  const b = bench();
  b.start(); b.axes(0, 255); b.tick();
  expect(b.values.receiver_read_ms).toBe(6);
  expect(b.values.motor_command_ms).toBe(5);
  expect(b.values.cycle_interval_ms).toBe(106);
  expect(b.values.leftY_raw).toBe(0);
  expect(b.values.rightX_raw).toBe(255);
  expect(b.values.steering_offset_deg).toBe(45);
});

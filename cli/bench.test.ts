import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';

function bench() {
  const source = ['controls.ts', 'bench.ts'].map(file => readFileSync(join(root, 'workspace/projects/car', file), 'utf8')).join('\n');
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  const buttons: Record<string, () => void> = {};
  const calls: unknown[][] = [];
  let loop = () => {};
  let left = 128, right = 128;
  let duringRead: (() => void) | undefined;
  const car = new Function('basic', 'serial', 'input', 'Button', 'IconNames', 'ps2Probe', 'PlanetX_Basic', 'nezhaV2', js + '\nreturn car;')(
    { showIcon() {}, pause() {}, forever: (f: () => void) => loop = f },
    { writeLine() {}, writeValue() {} },
    { onButtonPressed: (button: string, f: () => void) => buttons[button] = f },
    { A: 'A', B: 'B' }, { SmallSquare: 0, Yes: 1, No: 2 },
    { readByte: (command: number) => { calls.push(['read', command]); duringRead?.(); return command === 28 ? left : right; } },
    { value_A: { LY: 28, RX: 25 } },
    { MotorPostion: { M1: 1, M2: 2 }, MovementDirection: { CW: 1, CCW: 2 }, SportsMode: { Degree: 2 }, ServoMotionMode: { ShortPath: 1 }, DelayMode: { NoDelay: 0 },
      stop: (port: number) => calls.push(['stop', port]),
      readAbsAngle: () => { calls.push(['center']); return 350; },
      setServoSpeed: (value: number) => calls.push(['speed', value]),
      __move: (...args: unknown[]) => calls.push(['drive', ...args]),
      moveToAbsAngle: (...args: unknown[]) => calls.push(['steer', ...args]),
    });
  car.startControllerBench();
  return { buttons, calls, tick: () => loop(), axes: (l: number, r: number) => { left = l; right = r; },
    onRead: (f: () => void) => duringRead = f,
    arm: () => { buttons.A(); loop(); loop(); loop(); } };
}

test('controller bench stays still until explicitly armed with three neutral samples', () => {
  const b = bench();
  b.tick();
  expect(b.calls).toEqual([]);
  b.axes(0, 128);
  b.buttons.A();
  for (let i = 0; i < 4; i++) b.tick();
  expect(b.calls.every(call => call[0] === 'read')).toBe(true);
  b.axes(128, 128);
  b.tick(); b.tick(); b.tick();
  expect(b.calls.at(-1)).toEqual(['center']);
  expect(b.calls.some(call => call[0] === 'drive' || call[0] === 'steer')).toBe(false);
});

test('proportional drive uses finite moves, steering wraps around the captured center, stop precedes reads', () => {
  const b = bench();
  b.arm();
  b.calls.length = 0;
  b.axes(0, 255); b.tick();
  expect(b.calls).toContainEqual(['speed', 20]);
  expect(b.calls).toContainEqual(['drive', 1, 1, 20, 2]);
  expect(b.calls).toContainEqual(['steer', 2, 1, 35, 0]);
  b.calls.length = 0;
  b.axes(255, 0); b.tick();
  expect(b.calls.slice(0, 3)).toEqual([['stop', 1], ['stop', 2], ['read', 28]]);
  expect(b.calls).toContainEqual(['drive', 1, 2, 20, 2]);
  expect(b.calls).toContainEqual(['steer', 2, 1, 305, 0]);
  b.calls.length = 0;
  b.axes(68, 128); b.tick();
  expect(b.calls).toContainEqual(['speed', 9]);
  expect(b.calls).toContainEqual(['steer', 2, 1, 350, 0]);
  b.calls.length = 0;
  b.axes(128, 128); b.tick();
  expect(b.calls.some(call => call[0] === 'drive')).toBe(false);
});

test('receiver failure stops polling without automatic rearming; B disarms pending motion', () => {
  const b = bench();
  b.arm(); b.axes(0, 128); b.tick();
  b.calls.length = 0;
  b.axes(-1, 128); b.tick();
  expect(b.calls).toEqual([['stop', 1], ['stop', 2], ['read', 28]]);
  b.calls.length = 0;
  b.axes(128, 128); b.tick();
  expect(b.calls).toEqual([]);
  b.arm(); b.axes(0, 128); b.tick();
  b.calls.length = 0;
  b.buttons.B(); b.tick();
  expect(b.calls).toEqual([['stop', 1], ['stop', 2]]);
});

test('B during a yielding receiver read prevents further movement commands', () => {
  const b = bench();
  b.arm(); b.axes(0, 128);
  b.onRead(() => b.buttons.B());
  b.calls.length = 0; b.tick();
  expect(b.calls.every(call => call[0] === 'read')).toBe(true);
});

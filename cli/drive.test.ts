import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';

function driving(overrides = {}) {
  const source = ['settings.ts', 'controls.ts', 'drive.ts'].map(file => readFileSync(join(root, 'workspace/projects/car', file), 'utf8')).join('\n');
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  const calls: unknown[][] = [], frames: number[][] = [];
  const buttons: Record<string, () => void> = {};
  const axes: Record<number, number> = { 25: 128, 26: 128, 27: 128, 28: 128 };
  let loop = () => {}, time = 1000;
  const car = new Function('nezhaV2', 'basic', 'input', 'serial', 'Button', 'IconNames', 'ps2Probe', 'PlanetX_Basic', 'joystickDisplay', 'overrides',
    js + '\nObject.assign(carSettings, overrides); return car;')(
    { MotorPostion: { M1: 1, M2: 2 }, ServoMotionMode: { ShortPath: 1 }, DelayMode: { NoDelay: 0 },
      stop: (p: number) => calls.push(['stop', p]), start: (p: number, speed: number) => calls.push(['drive', p, speed]),
      setServoSpeed: (speed: number) => calls.push(['speed', speed]),
      readAbsAngle: () => { calls.push(['center']); return 350; },
      moveToAbsAngle: (...args: unknown[]) => calls.push(['steer', ...args]) },
    { showIcon() {}, forever: (fn: () => void) => loop = fn, pause: (ms: number) => time += ms },
    { runningTime: () => time, onButtonPressed: (b: string, fn: () => void) => buttons[b] = fn },
    { writeLine() {}, writeValue() {} }, { A: 'A', B: 'B' }, { SmallSquare: 0, No: 1 },
    { readByte: (command: number) => { calls.push(['read', command]); time += 5; return axes[command]; } },
    { value_A: { RX: 25, RY: 26, LX: 27, LY: 28 } },
    { draw: (x: number, y: number) => frames.push([x, y]) }, overrides);
  car.startDriving();
  return { calls, frames, buttons, axes, tick: () => loop(), ready: () => { loop(); loop(); loop(); } };
}

test('normal startup stops both outputs, waits for neutral, and buttons only select the stick display', () => {
  const d = driving();
  expect(d.calls).toEqual([['stop', 1], ['stop', 2]]);
  d.axes[28] = 0; d.ready();
  expect(d.calls.some(c => c[0] === 'drive' || c[0] === 'steer')).toBe(false);
  d.axes[28] = 128; d.ready();
  d.axes[27] = 255; d.axes[26] = 0;
  d.tick(); expect(d.frames.at(-1)).toEqual([1, 0]);
  d.calls.length = 0;
  d.buttons.B(); d.tick();
  expect(d.frames.at(-1)).toEqual([0, 1]);
  expect(d.calls).toEqual([['read', 28], ['read', 25], ['read', 26]]);
  d.buttons.A(); d.tick(); expect(d.frames.at(-1)).toEqual([1, 0]);
});

test('drive and steering commands precede extra display reads and stay continuous until demand changes', () => {
  const d = driving(); d.ready(); d.calls.length = 0;
  d.axes[28] = 0; d.axes[25] = 255; d.tick();
  expect(d.calls).toEqual([['read', 28], ['read', 25], ['drive', 1, 20], ['steer', 2, 1, 35, 0], ['read', 27]]);
  d.calls.length = 0; d.tick();
  expect(d.calls).toEqual([['read', 28], ['read', 25], ['read', 27]]);
  d.axes[28] = 128; d.calls.length = 0; d.tick();
  expect(d.calls).toContainEqual(['stop', 1]);
});

test('failure on either control data or display data stops both motors and never auto-recovers', () => {
  for (const command of [28, 25, 27]) {
    const d = driving(); d.ready(); d.axes[28] = 0; d.tick();
    d.calls.length = 0; d.axes[command] = -1; d.tick();
    expect(d.calls.slice(-2)).toEqual([['stop', 1], ['stop', 2]]);
    d.calls.length = 0; d.axes[command] = 128; d.buttons.B(); d.tick();
    expect(d.calls).toEqual([]);
  }
});

test('chassis mode requires measured limits and supports inverted coordinates across zero', () => {
  const blocked = driving({ looseMotorBench: false }); blocked.ready();
  expect(blocked.calls).toEqual([['stop', 1], ['stop', 2]]);
  const d = driving({ looseMotorBench: false, steeringCalibrated: true, steeringLeftDegrees: 375,
    steeringCenterDegrees: 350, steeringRightDegrees: 325 });
  d.ready(); d.axes[25] = 0; d.tick();
  expect(d.calls).toContainEqual(['steer', 2, 1, 15, 0]);
  expect(d.calls.some(c => c[0] === 'center')).toBe(false);
});

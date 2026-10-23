import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';
// Exercise the exact pure firmware source, while PXT separately validates its subset.
const source = readFileSync(join(root, 'workspace/projects/car/controls.ts'), 'utf8');
const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
const controls = new Function(js + '\nreturn carControls;')();
test('measured asymmetric sticks have neutral dead zone, proportional output and bounded endpoints', () => {
  for (const raw of [119, 125, 131]) expect(controls.axis(raw, 5, 125, 250, 6, false)).toBe(0);
  expect(controls.axis(0, 5, 125, 250, 6, false)).toBe(-1);
  expect(controls.axis(255, 5, 125, 250, 6, true)).toBe(-1);
  expect(controls.axis(190.5, 5, 125, 250, 6, false)).toBeCloseTo(0.5);
  expect(controls.axis(150, 125, 125, 250, 6, false)).toBe(0);
  expect(controls.drivePercent(0.5, 20)).toBe(10);
  expect(controls.drivePercent(-2, 20)).toBe(-20);
});
test('steering maps stick displacement to measured position, including reversed linkage', () => {
  expect(controls.steeringPosition(0, 80, 100, 135)).toBe(100);
  expect(controls.steeringPosition(-0.5, 80, 100, 135)).toBe(90);
  expect(controls.steeringPosition(2, 80, 100, 135)).toBe(135);
  expect(controls.steeringPosition(-1, 135, 100, 80)).toBe(135);
});

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';
const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(join(root, 'workspace/projects/car/display.ts'), 'utf8'));
const display = new Function(js + '\nreturn joystickDisplay;')();

test('moving dot covers the full matrix, keeps a center reference, and blends subpixel positions', () => {
  expect(display.frame(0, 0, 0, false)[12]).toBe(255);
  expect(display.frame(-1, -1, 0, false)[20]).toBe(255);
  expect(display.frame(1, 1, 0, false)[4]).toBe(255);
  const halfway = display.frame(0.25, 0, 0, false);
  expect(halfway[12]).toBe(128);
  expect(halfway[13]).toBe(128);
  expect(display.frame(1, 0, 0, false)[12]).toBeGreaterThan(0);
});

test('coarse/fine rings align at all eight compass directions and retain pointers when radius overlaps', () => {
  const outer = [2, 4, 14, 24, 22, 20, 10, 0];
  const inner = [7, 8, 13, 18, 17, 16, 11, 6];
  for (let k = 0; k < 8; k++) {
    const angle = k * Math.PI / 4;
    const pixels = display.frame(Math.sin(angle), Math.cos(angle), 1, false);
    expect(pixels[outer[k]]).toBeGreaterThanOrEqual(128);
    expect(pixels[inner[k]]).toBe(128);
    expect(pixels[12]).toBe(128);
  }
  const diagonal = display.frame(-1, -1, 1, false);
  expect([diagonal[20], diagonal[16], diagonal[12]]).toEqual([128, 128, 128]);
  expect(display.frame(0, 0, 1, true)[24]).toBe(255); // Zero radius: bottom right.
  expect(display.frame(0, -1, 1, true)[4]).toBe(255); // Full radius: top right.
});

test('every renderer output is a valid 25-pixel brightness frame across the input range', () => {
  for (let style = 0; style < 3; style++) for (let degrees = 0; degrees < 360; degrees += 7) {
    const angle = degrees * Math.PI / 180;
    const pixels = display.frame(Math.sin(angle) * 1.2, Math.cos(angle) * 1.2, style, true);
    expect(pixels).toHaveLength(25);
    expect(pixels.every((v: number) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  }
});

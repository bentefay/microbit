import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';
const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(join(root, 'workspace/projects/car/car.ts'), 'utf8'));

test('commissioning stops I2C polling after failure and requires an explicit retry', () => {
  const loops: (() => void)[] = [];
  const buttons: Record<string, () => void> = {};
  const reads: number[] = [];
  const logs: string[] = [];
  let available = false;
  const car = new Function('basic', 'serial', 'input', 'Button', 'IconNames', 'ps2Probe', 'PlanetX_Basic', js + '\nreturn car;')(
    { showIcon() {}, showString() {}, pause() {}, forever: (f: () => void) => loops.push(f) },
    { writeLine: (s: string) => logs.push(s), writeValue() {} },
    { onButtonPressed: (b: string, f: () => void) => buttons[b] = f },
    { A: 'A', B: 'B', AB: 'AB' }, { Yes: 1, No: 0 },
    { readByte: (command: number) => { reads.push(command); return available ? 128 : -1; } },
    { value_A: { LY: 28, RX: 25 } });
  car.startCommissioning();
  loops[0]();
  expect(reads).toEqual([]);
  buttons.AB();
  loops[0]();
  expect(reads).toEqual([28]); // Stop immediately; don't request the second axis.
  available = true;
  loops[0]();
  loops[1]();
  expect(reads).toEqual([28]); // Reconnection alone must not resume polling.
  expect(logs.at(-1)).toContain('receiver fault; polling stopped');
  buttons.AB();
  loops[0]();
  expect(reads).toEqual([28, 28, 25]);
});

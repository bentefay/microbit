import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './main';

test('loose motor test makes no startup motion and only sends bounded relative moves', () => {
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(join(root, 'workspace/projects/motor-test/main.ts'), 'utf8'));
  const buttons: Record<string, () => void> = {};
  const calls: unknown[][] = [];
  new Function('nezhaV2', 'basic', 'serial', 'input', 'Button', 'IconNames', js)(
    { MotorPostion: { M1: 1, M2: 2 }, MovementDirection: { CW: 1, CCW: 2 }, SportsMode: { Degree: 2 }, DelayMode: { NoDelay: 0 },
      move: (...args: unknown[]) => calls.push(['move', ...args]), stop: (port: number) => calls.push(['stop', port]) },
    { showIcon() {}, pause() {} }, { writeLine() {} },
    { onButtonPressed: (b: string, f: () => void) => buttons[b] = f },
    { A: 'A', B: 'B', AB: 'AB' }, { SmallSquare: 0 });
  expect(calls).toEqual([]);
  buttons.A();
  buttons.B();
  buttons.AB();
  expect(calls).toEqual([
    ['move', 2, 15, 1, 20, 2, 0], ['stop', 2],
    ['move', 2, 15, 2, 20, 2, 0], ['stop', 2], ['stop', 2],
  ]);
});

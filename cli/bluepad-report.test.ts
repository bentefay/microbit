import { expect, test } from 'bun:test';
import { bluepadReport } from './bluepad-report';
const lines = (...values: string[]) => values.map(line => JSON.stringify({ type: 'line', line })).join('\n');
test('input exercise needs every control group and a sampled return to neutral', () => {
  const full = lines('BP_STATUS,1,1000,connected,1,0',
    'BP_INPUT,1100,1,-500,-500,-500,-500,1023,1023,15,15,0',
    'BP_INPUT,1200,2,500,500,500,500,0,0,0,0,0',
    'BP_INPUT,1300,3,0,0,0,0,0,0,0,0,0',
    'BP_INPUT,1400,4,0,0,0,0,0,0,0,0,0',
    'BP_INPUT,1500,5,0,0,0,0,0,0,0,0,0');
  expect(bluepadReport(full).inputExerciseComplete).toBe(true);
  expect(bluepadReport(full + '\n' + lines('BP_STATUS,1,10,waiting,0,0')).inputExerciseComplete).toBe(false);
  expect(bluepadReport(lines('BP_INPUT,1000,1,0,0,0,0,0,0,0,0,0')).checks.sticks).toBe(false);
});
test('missing input time cannot establish a continuous neutral return', () => {
  const report = bluepadReport(lines('BP_INPUT,1000,1,0,0,0,0,0,0,0,0,0',
    'BP_INPUT,10000,2,0,0,0,0,0,0,0,0,0', 'BP_INPUT,nope'));
  expect(report.checks.returnedToNeutral).toBe(false);
  expect(report.snapshots).toBe(2);
});
test('display readiness and update counts come from firmware, and reset with it', () => {
  const log = lines('BP_STATUS,1,1000,connected,1,100', 'BP_DISPLAY,1000,1,100');
  expect(bluepadReport(log).display).toEqual({ ready: true, updates: 100 });
  expect(bluepadReport(log + '\n' + lines('BP_STATUS,1,10,waiting,0,0')).display).toBeNull();
  expect(bluepadReport(lines('BP_DISPLAY,1000,0,0')).display?.ready).toBe(false);
});

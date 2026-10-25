import { expect, test } from 'bun:test';
import { BluepadMonitor } from './bluepad-monitor';

test('USB open and elapsed human response time never start a session', () => {
  const m = new BluepadMonitor();
  expect(m.push('BP_MONITOR_OPEN', 0)).toBeUndefined();
  expect(m.state).toBe('awaiting-firmware');
  expect(m.checkSilence(6000)).toContain('unverified');
  expect(m.push('BP_STATUS,1,1000,waiting,0,0', 7000)).toContain('READY:');
  for (let t = 8000; t < 100000; t += 1000) {
    m.push(`BP_STATUS,1,${t},waiting,0,0`, t);
    expect(m.checkSilence(t)).toBeUndefined();
  }
  expect(m.state).toBe('waiting');
  expect(m.button).toBe(0);
});
test('latched status recovers missed start, input follows readiness, restart clears input', () => {
  const m = new BluepadMonitor();
  expect(m.push('BP_INPUT,1000,1,0,0,0,0,0,0,0,0,0', 0)).toBeUndefined();
  expect(m.push('BP_STATUS,1,3000,scanning,2,0', 1000)).toContain('START RECEIVED (B)');
  expect(m.push('BP_STATUS,1,4000,connected,2,1', 2000)).toContain('CONTROLLER READY');
  expect(m.push('BP_INPUT,4100,2,10,-20,30,-40,0,0,1,0,0', 2100)).toContain('INPUT RECEIVED');
  expect(m.lastInput?.slice(0, 4)).toEqual([10, -20, 30, -40]);
  expect(m.checkSilence(8000)).toContain('not a controller radio-loss');
  expect(m.push('BP_INPUT,10000,3,0,0,0,0,0,0,0,0,0', 8100)).toBeUndefined();
  expect(m.push('BP_STATUS,1,1000,waiting,0,0', 9000)).toContain('READY:');
  expect(m.lastInput).toBeNull();
  expect(m.button).toBe(0);
});
test('malformed or unsupported status cannot establish readiness', () => {
  const m = new BluepadMonitor();
  for (const line of ['BP_WAIT,1', 'BP_STATUS,2,1000,waiting,0,0',
    'BP_STATUS,1,no,waiting,0,0', 'BP_STATUS,1,1000,waiting,9,0', 'BP_STATUS,1,1000,unknown,0,0']) {
    expect(m.push(line, 1000)).toBeUndefined();
  }
  expect(m.lastStatusAt).toBeNull();
});

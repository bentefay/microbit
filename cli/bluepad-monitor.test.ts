import { expect, test } from 'bun:test';
import { BluepadMonitor } from './bluepad-monitor';

test('continuous motor status tracks commands, stale stop and firmware restart', () => {
  const m = new BluepadMonitor();
  m.push('BP_STATUS,1,10000,waiting,0,0', 0);
  expect(m.push('BP_DRIVE,10000,waiting,-1,0,-1,-1,0,0,0,0', 1)).toContain('Front micro:bit');
  expect(m.push('BP_DRIVE,11000,active,1,20,35,350,10,0,10,2', 2)).toContain('Either stick');
  expect(m.drive).toMatchObject({ speed: 20, target: 35, center: 350, writes: 10, livenessAgeMs: 10, maxIoMs: 2 });
  expect(m.push('BP_DRIVE,12000,stale,1,0,-1,350,12,0,501,2', 3)).toContain('motors stopped');
  m.push('BP_STATUS,1,1000,waiting,0,0', 4);
  expect(m.drive).toBeNull();
});

test('finite motor state survives missed events, exposes failure and resets on reboot', () => {
  const m = new BluepadMonitor();
  m.push('BP_STATUS,1,10000,waiting,0,0', 0);
  expect(m.push('BP_MOTOR,10000,waiting,0,0', 1)).toContain('MOTOR BENCH READY');
  expect(m.push('BP_MOTOR,11000,move,1,0', 2)).toContain('step 1/4');
  expect(m.push('BP_MOTOR,12000,move,1,0', 3)).toBeUndefined();
  m.push('BP_MOTOR,13000,done,4,0', 4);
  expect(m.motor?.state).toBe('done');
  m.push('BP_MOTOR,14000,fault,2,-5', 5);
  expect(m.motor?.result).toBe(-5);
  m.push('BP_MOTOR,15000,done,9,0', 6);
  expect(m.motor?.state).toBe('fault');
  m.push('BP_STATUS,1,1000,waiting,0,0', 7);
  expect(m.motor).toBeNull();
});

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
test('disconnect is not announced as a new physical button press', () => {
  const m = new BluepadMonitor();
  m.push('BP_STATUS,1,1000,scanning,1,0', 0);
  m.push('BP_STATUS,1,2000,connected,1,1', 1000);
  m.push('BP_INPUT,2100,2,0,0,0,0,0,0,0,0,0', 1100);
  expect(m.push('BP_STATUS,1,3000,scanning,1,2', 2000)).toContain('DISCONNECTED');
  expect(m.lastInput).toBeNull();
  m.push('BP_STATUS,1,4000,connected,1,2', 3000);
  expect(m.push('BP_INPUT,4100,3,0,0,0,0,0,0,0,0,0', 3100)).toContain('INPUT RECEIVED');
});

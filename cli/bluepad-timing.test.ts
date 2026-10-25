import { expect, test } from 'bun:test';
import { bluepadTiming } from './bluepad-timing';
test('cadence excludes idle gaps, unchanged axes and cross-connection samples', () => {
  const lines = ['Device AA:BB:CC:DD:EE:01 is connected',
    'BP_INPUT,1000,1,0,0,0,0,0,0,0,0,0',
    'BP_INPUT,1120,3,100,0,0,0,0,0,0,0,0',
    'BP_INPUT,1240,5,100,0,0,0,0,0,0,0,0',
    'BP_INPUT,9000,6,0,0,0,0,0,0,0,0,0',
    'BP_DISCONNECTED,9500', 'BP_INPUT,9600,7,200,0,0,0,0,0,0,0,0',
    'Device AA:BB:CC:DD:EE:02 is connected',
    'BP_INPUT,10000,8,0,0,0,0,0,0,0,0,0',
    'BP_INPUT,10120,24,100,0,0,0,0,0,0,0,0'];
  const result = bluepadTiming(lines.map(line => JSON.stringify({type: 'line', line})).join('\n'));
  expect(result.map(r => r.movingWindows)).toEqual([1, 1]);
  expect(result.map(r => r.medianMeanCallbackSpacingMs)).toEqual([60, 7.5]);
});

import { test, expect } from 'bun:test';
import { latencyReport } from './latency';
const capture = (lines: string[]) => lines.map(line => JSON.stringify({ type: 'line', ms: 999999, line })).join('\n');

test('latency report separates reaction/link time, command dispatch, and sampled encoder reversal', () => {
  const report = latencyReport(capture([
    'LAT_SAMPLE,1,0,0,20,5,10,0', 'LAT_SAMPLE,1,40,0,20,45,50,10', 'LAT_SAMPLE,1,80,0,20,85,90,20',
    'LAT_CUE,2,100,-1,0',
    'LAT_SAMPLE,2,120,255,-20,125,150,25', 'LAT_SAMPLE,2,170,255,-20,175,200,27',
    'LAT_SAMPLE,2,220,255,-20,225,250,20', 'LAT_SAMPLE,2,270,255,-20,275,300,10',
  ]));
  expect(report[0].cueToInputMs).toBe(20);
  expect(report[0].inputToCommandMs).toBe(5);
  expect(report[0].encoderResponseMs).toBe('75–125');
});

test('latency report rejects pre-positioning and does not invent missing responses', () => {
  const report = latencyReport(capture(['LAT_CUE,1,100,1,0', 'LAT_CUE,2,200,-1,128']));
  expect(report[0].cueToInputMs).toBeNull();
  expect(report[0].note).toContain('already');
  expect(report[1].encoderResponseMs).toBe('unresolved');
  expect(() => latencyReport(capture(['LAT_CUE,1,100,1,128', 'LAT_CUE,1,100,1,128']))).toThrow('multiple runs');
});

test('encoder jumps are reported as untrusted, not fast motor response', () => {
  const report = latencyReport(capture(['LAT_SAMPLE,0,0,128,0,1,10,20000', 'LAT_CUE,1,100,1,128',
    'LAT_SAMPLE,1,120,0,20,125,150,0', 'LAT_SAMPLE,1,170,0,20,175,200,10']));
  expect(report[0].encoderResponseMs).toBe('unresolved');
  expect(report[0].note).toContain('discontinuity');
});

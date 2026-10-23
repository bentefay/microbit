import { test, expect } from 'bun:test';
import { receiverReport } from './receiver-report';
const log = (lines: string[]) => lines.map(line => JSON.stringify({ type: 'line', line })).join('\n');
test('receiver analysis reports device-timed repeats and centers without bridging gaps', () => {
  const result: any = receiverReport(log([
    'RX_FRAME,1,0,100,120,255,128,128', 'RX_FRAME,2,0,170,190,255,128,128',
    'RX_FRAME,3,0,240,260,128,128,128', 'RX_FRAME,4,0,310,330,128,128,128',
    'RX_FRAME,5,0,380,400,0,128,128', 'RX_FRAME,8,0,1000,1020,0,128,128',
    'RX_READ,8,0,28,1000,1006,128,1,16,16,2,2,2,0',
    'RX_READ,9,0,28,1070,1072,-2,1,-2,-2,2,0,0,-1010'
  ]))[0];
  expect(result.cycleMs).toEqual({ count: 4, min: 70, median: 70, p95: 70, max: 70 });
  expect(result.identicalXYObservedSpanMs.max).toBe(70);
  expect(result.xyChangeIntervalMs.max).toBe(140);
  expect(result.centers).toEqual([{ startMs: 260, observedSpanMs: 70, samples: 2 }]);
  expect(result.readErrors).toEqual([{ sequence: 9, command: 28, result: -2, nativeStatus: -1010 }]);
});
test('malformed traces cannot silently produce timing conclusions', () => {
  expect(() => receiverReport(log(['RX_FRAME,1,0,100,90,128,128,128']))).toThrow();
  expect(() => receiverReport(log(['RX_FRAME,1,0,100,120,999,128,128']))).toThrow();
  expect(() => receiverReport(log(['RX_READ,1,0,28,100,105,128']))).toThrow();
});

import { test, expect } from 'bun:test';
import { SerialLines } from './serial';
test('serial records survive fragmentation at both Docker and USB boundaries', () => {
  const parser = new SerialLines();
  const transport = [JSON.stringify('leftY_ra'), JSON.stringify('w:0  \r\nrightX_raw:12'), JSON.stringify('8 \r\n')].join('\n') + '\n';
  const lines: string[] = [];
  for (const character of transport) lines.push(...parser.push(character));
  expect(lines).toEqual(['leftY_raw:0', 'rightX_raw:128']);
  expect(parser.incomplete).toBe(false);
  expect(parser.push(JSON.stringify('leftY_raw:2') + '\n')).toEqual([]);
  expect(parser.incomplete).toBe(true);
});
test('serial decoding rejects unexpected and unbounded transport input', () => {
  expect(() => new SerialLines().push('{}\n')).toThrow();
  expect(() => new SerialLines().push('x'.repeat(65537))).toThrow();
  expect(() => new SerialLines().push(JSON.stringify('x'.repeat(65537)) + '\n')).toThrow();
});

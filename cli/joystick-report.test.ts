import { expect, test } from 'bun:test';
import { joystickReport } from './joystick-report';
const capture = (rows: string[]) => rows.map((line, i) => JSON.stringify({ type: 'line', ms: i * 1000, line })).join('\n');
test('normal capture analysis separates stick selection and identifies centered samples', () => {
  const result = joystickReport(capture(['CAR_STATE,1,0,0,128,255,20,0,72,16',
    'CAR_STATE,1,0,128,128,128,0,0,68,14', 'CAR_STATE,1,1,128,255,0,0,45,80,15']));
  expect(result[0].rawX).toEqual([128, 255]);
  expect(result[0].rawY).toEqual([0, 128]);
  expect(result[0].exactCenterSeconds).toEqual([1]);
  expect(result[0].radiusBelow90Percent).toEqual([{ seconds: 1, rawX: 128, rawY: 128, normalizedRadius: 0 }]);
  expect(result[1].rawX).toEqual([255, 255]);
  expect(result[1].rawY).toEqual([0, 0]);
  expect(result[1].exactCenterSeconds).toEqual([]);
});
test('malformed records cannot masquerade as joystick samples', () => {
  expect(() => joystickReport(capture(['CAR_STATE,1,0,0']))).toThrow('Invalid');
  expect(() => joystickReport(capture(['CAR_STATE,1,0,0,128,256,20,0,72,16']))).toThrow('byte');
});

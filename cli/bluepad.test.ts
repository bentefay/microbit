import { expect, test } from 'bun:test';
import { bluepad, bluepadArgs, validateBluepadHex } from './bluepad';
import { validateHex, validateBluepadFlashVariant } from './main';

function record(address: number, type: number, data: number[]) {
  const bytes = [data.length, address >> 8, address & 255, type, ...data];
  bytes.push((-bytes.reduce((a, b) => a + b, 0)) & 255);
  return ':' + Buffer.from(bytes).toString('hex').toUpperCase();
}
test('native HEX validation protects pairing storage and UICR', () => {
  const hex = (base: number, offset: number, bytes: number[]) => [record(0, 4, [base >> 8, base & 255]),
    record(offset, 0, bytes), record(0, 1, [])].join('\n');
  const valid = hex(7, 0x9ffc, [1, 2, 3, 4]);
  validateHex(valid);
  validateBluepadHex(valid);
  for (const bad of [hex(7, 0x9fff, [1, 2]), hex(7, 0xa000, [1]), hex(0x1000, 0x1000, [1])]) {
    validateHex(bad);
    expect(() => validateBluepadHex(bad)).toThrow();
  }
  expect(() => validateBluepadHex(record(0, 14, [1]))).toThrow();
  for (const kind of [3, 5]) {
    validateBluepadHex(record(0, kind, [0, 0, 0x12, 0x35]));
    expect(() => validateBluepadHex(record(0, kind, [0xff, 0xff, 0xff, 0xff]))).toThrow();
  }
});
test('native build has read-only sources, isolated output and no device or network access', () => {
  const args = bluepadArgs('/repo', '/repo/workspace/projects/bluepad/built/report-only');
  expect(args[args.indexOf('--network') + 1]).toBe('none');
  expect(args).toContain('--read-only');
  expect(args).toContain('--cap-drop=ALL');
  expect(args).toContain('type=bind,src=/repo/workspace/projects/bluepad,dst=/app,readonly');
  expect(args).toContain('type=bind,src=/repo/workspace/projects/bluepad/built/report-only,dst=/build');
  expect(args.join(' ')).not.toMatch(/--privileged|--device|docker\.sock|\/dev\/bus/);
});
test('unknown native build flags and flashing are rejected before starting Docker', async () => {
  const command = async () => { throw new Error('must not execute'); };
  for (const args of [['flash'], ['build', '--flash'], ['test', '--nezha-compile-only'],
    ['test', '--motor-bench'], ['test', '--motor-drive'], ['build', '--motor-bench', '--nezha-compile-only'],
    ['build', '--motor-drive', '--motor-bench']]) {
    await expect(bluepad('/repo', args, command, validateHex)).rejects.toThrow('Use run bluepad');
  }
});
test('continuous drive flash requires its own explicit selection', () => {
  const drive = { variant: 'motor-drive', motorDrive: true, motorBench: false, motorAdapterPresent: false };
  validateBluepadFlashVariant(drive, false, true);
  expect(() => validateBluepadFlashVariant(drive, false)).toThrow();
  expect(() => validateBluepadFlashVariant(drive, true)).toThrow();
  expect(() => validateBluepadFlashVariant(drive, true, true)).toThrow();
  expect(() => validateBluepadFlashVariant({ ...drive, motorDrive: false }, false, true)).toThrow();
});
test('finite motor firmware must be explicitly selected and compile-only cannot flash', () => {
  const report = { variant: 'report-only', motorAdapterPresent: false, motorBench: false };
  const bench = { variant: 'motor-bench', motorAdapterPresent: false, motorBench: true };
  validateBluepadFlashVariant(report, false);
  validateBluepadFlashVariant(bench, true);
  expect(() => validateBluepadFlashVariant(bench, false)).toThrow();
  expect(() => validateBluepadFlashVariant(report, true)).toThrow();
  for (const selected of [true, false]) {
    expect(() => validateBluepadFlashVariant({ variant: 'nezha-compile-only', motorAdapterPresent: true }, selected)).toThrow();
    expect(() => validateBluepadFlashVariant({ ...bench, motorAdapterPresent: true }, selected)).toThrow();
  }
});

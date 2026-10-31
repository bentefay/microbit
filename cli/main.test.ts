import { test, expect } from 'bun:test';
import { projectName, validateHex, runtimeArgs, editorUrl, microbitMountCandidate } from './main';
test('mount recovery selects only one FAT device below the exact microbit USB path', () => {
  const good = { path: '/dev/sda', fstype: 'vfat', sysfs: '/sys/usb/1-9/host/block/sda' };
  const unrelated = { path: '/dev/sdb', fstype: 'vfat', sysfs: '/sys/usb/1-99/host/block/sdb' };
  expect(microbitMountCandidate('/sys/usb/1-9', [good, unrelated])).toBe('/dev/sda');
  expect(microbitMountCandidate('/sys/usb/1-9', [{ ...good, fstype: null }])).toBe('/dev/sda');
  for (const candidates of [[], [unrelated], [good, good], [{ ...good, fstype: 'ext4' }], [{ ...good, path: '--all' }]]) {
    expect(() => microbitMountCandidate('/sys/usb/1-9', candidates)).toThrow();
  }
});
test('shared editor URL preserves filesystem selection across the PXT root redirect', () => {
  expect(editorUrl('Serving http://0.0.0.0:3232/#local_token=test&wsport=3233'))
    .toBe('http://localhost:3232/index.html?ws=fs#local_token=test&wsport=3233');
  expect(() => editorUrl('starting')).toThrow();
});
test('project selection cannot escape the workspace or become a Docker argument', () => {
  for (const value of ['../secret', '/etc', '--privileged', '', 'car/name']) expect(() => projectName(value)).toThrow();
  expect(projectName('car')).toBe('car');
});
test('invalid or incomplete HEX cannot be flashed', () => {
  validateHex(':0400000001020304F2\n:00000001FF\n');
  expect(() => validateHex(':00000001FF\n')).toThrow();
  expect(() => validateHex(':00000001FE\n')).toThrow();
  expect(() => validateHex(':020000040000FA\n')).toThrow();
  validateHex(':0400000001020304F2\n:00000001FF\n\n:0100000E00F1\n');
  expect(() => validateHex(':0400000001020304F2\n:00000001FF\n:0400000001020304F2')).toThrow();
});
test('build isolation has no network, broad USB or Docker socket', () => {
  const args = runtimeArgs();
  expect(args[args.indexOf('--network') + 1]).toBe('none');
  expect(args).toContain('--cap-drop=ALL');
  expect(args.join(' ')).not.toContain('docker.sock');
  expect(args.join(' ')).not.toContain('/dev/bus/usb');
  expect(args.join(' ')).not.toContain('--privileged');
});

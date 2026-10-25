import { expect, test } from 'bun:test';
import { DualPads } from './bluepad-dual';
test('two identities and simultaneous display writes stay separate across slot reuse and reboot', () => {
  const m = new DualPads();
  m.push('BP_READY,1000,0,AA:BB:CC:DD:EE:01');
  m.push('BP_READY,2000,1,AA:BB:CC:DD:EE:02');
  m.push('BP_PEERS,2100,3,0');
  m.push('BP_PAD,2200,0,7,500,0,0,0,0,0,0,0,0');
  m.push('BP_PAD,2201,1,3,-500,0,0,0,0,0,0,0,0');
  expect(m.pads[0].lastInput![0]).toBe(500);
  expect(m.pads[1].lastInput![0]).toBe(-500);
  expect(m.result().bothDroveDisplayWhileConnected).toBe(false);
  m.push('BP_SLOT,3000,0,AA:BB:CC:DD:EE:01,20,10');
  m.push('BP_SLOT,3000,1,AA:BB:CC:DD:EE:02,10,5');
  expect(m.result().bothDroveDisplayWhileConnected).toBe(true);
  m.push('BP_PEERS,3100,1,1'); // impossible owner must not change state
  expect(m.mask).toBe(3);
  m.push('BP_PEERS,3200,2,1');
  expect(m.owner).toBe(1);
  m.push('BP_PAD,3300,1,11,-500,0,0,0,0,0,0,0,0');
  expect(m.result().soloSnapshotsByAddress['AA:BB:CC:DD:EE:02']).toBe(1);
  m.push('BP_READY,3400,0,AA:BB:CC:DD:EE:01');
  expect(m.result().connectionsByAddress['AA:BB:CC:DD:EE:01']).toBe(2);
  m.push('BP_READY,4000,0,AA:BB:CC:DD:EE:03');
  expect(m.pads[0].snapshots).toBe(0);
  expect(m.result().bothDroveDisplayWhileConnected).toBe(false);
  m.push('*** Booting Zephyr OS ***');
  expect(m.everBoth).toBe(false); expect(m.pads).toEqual({});
});

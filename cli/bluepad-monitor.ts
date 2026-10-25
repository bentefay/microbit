import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { captureSerial } from './serial';

/** Device reports readiness; silence and host USB presence never imply readiness. */
export class BluepadMonitor {
  state = 'awaiting-firmware';
  button = 0;
  reports = 0;
  lastStatusAt: number | null = null;
  lastInput: number[] | null = null;
  private uptime = 0;
  push(line: string, hostMs: number): string | undefined {
    const p = line.split(',');
    const before = this.state;
    if (p[0] === 'BP_STATUS' && p.length === 6 && p[1] === '1' &&
      ['initializing', 'button-error', 'waiting', 'scanning', 'connected'].includes(p[3]) &&
      [p[2], p[4], p[5]].every(x => /^\d+$/.test(x)) && Number(p[4]) <= 3) {
      const uptime = Number(p[2]);
      if (uptime < this.uptime || p[3] === 'waiting') this.lastInput = null;
      this.uptime = uptime;
      this.lastStatusAt = hostMs;
      this.state = p[3];
      this.button = Number(p[4]);
      this.reports = Number(p[5]);
      if (this.state !== before) {
        if (this.state === 'waiting') return 'READY: put one Xbox controller in pairing mode, then press and release micro:bit A or B. No chat reply needed.';
        if (this.state === 'scanning') return `START RECEIVED (${this.button === 1 ? 'A' : this.button === 2 ? 'B' : 'A+B'}): watching for a controller connection.`;
        if (this.state === 'connected') return 'CONTROLLER READY: input monitoring is active.';
        return `Firmware state: ${this.state}`;
      }
    } else if (p[0] === 'BP_INPUT' && p.length === 12 && p.slice(1).every(x => /^-?\d+$/.test(x)) &&
      this.button > 0 && this.lastStatusAt !== null && hostMs - this.lastStatusAt < 5000) {
      const first = this.lastInput === null;
      this.lastInput = p.slice(3).map(Number);
      this.reports = Number(p[2]);
      if (first) return 'INPUT RECEIVED: controller reports are arriving; all snapshots are being saved.';
    }
  }
  checkSilence(hostMs: number): string | undefined {
    if (hostMs - (this.lastStatusAt ?? 0) > 5000 && this.state !== 'telemetry-missing') {
      this.state = 'telemetry-missing';
      return 'No current firmware heartbeat. Readiness is unverified; monitoring continues. This is not a controller radio-loss measurement.';
    }
  }
}

export async function monitorBluepad(argv: string[], root: string) {
  const directory = join(root, '.cache/observations');
  await mkdir(directory, { recursive: true });
  const status = join(directory, 'bluepad-live.json');
  const model = new BluepadMonitor();
  const start = performance.now();
  let writes = Promise.resolve();
  const save = (active: boolean) => {
    const body = JSON.stringify({ active, updated: new Date().toISOString(), ...model }, null, 2) + '\n';
    writes = writes.then(async () => {
      await writeFile(status + '.next', body);
      await rename(status + '.next', status);
    });
    return writes;
  };
  const announce = (message: string | undefined) => { if (message) console.log('\x07' + message); };
  console.log('Continuous monitor: waiting for firmware heartbeat. Human readiness has no timeout. Ctrl-C stops capture.');
  await save(true);
  const timer = setInterval(() => {
    const message = model.checkSilence(performance.now() - start);
    if (message) { announce(message); void save(true).catch(console.error); }
  }, 1000);
  try {
    await captureSerial(argv, directory, 'bluepad-session', async (line) => {
      announce(model.push(line, performance.now() - start));
      if (line.startsWith('BP_STATUS,') || line.startsWith('BP_INPUT,')) await save(true);
      return !line.startsWith('BP_');
    });
  } finally {
    clearInterval(timer);
    await save(false);
  }
}

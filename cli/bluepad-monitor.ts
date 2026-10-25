import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { captureSerial } from './serial';
import { DualPads } from './bluepad-dual';

/** Device reports readiness; silence and host USB presence never imply readiness. */
export class BluepadMonitor {
  state = 'awaiting-firmware';
  button = 0;
  reports = 0;
  lastStatusAt: number | null = null;
  lastInput: number[] | null = null;
  motor: { state: string; step: number; result: number; deviceMs: number } | null = null;
  drive: { state: string; owner: number; speed: number; target: number; center: number;
    writes: number; result: number; inputAgeMs: number; maxIoMs: number; deviceMs: number } | null = null;
  private uptime = 0;
  private sawStart = false;
  dual = new DualPads();
  push(line: string, hostMs: number): string | undefined {
    const dualNotice = this.dual.push(line);
    if (dualNotice) return dualNotice;
    const p = line.split(',');
    if (p[0] === 'BP_DRIVE' && p.length === 11 &&
      ['waiting', 'input', 'neutral', 'active', 'stale', 'aborted', 'fault'].includes(p[2]) &&
      [p[1], ...p.slice(3)].every(x => /^-?\d+$/.test(x)) && ['-1', '0', '1'].includes(p[3])) {
      const changed = this.drive?.state !== p[2];
      this.drive = { deviceMs: Number(p[1]), state: p[2], owner: Number(p[3]), speed: Number(p[4]),
        target: Number(p[5]), center: Number(p[6]), writes: Number(p[7]), result: Number(p[8]),
        inputAgeMs: Number(p[9]), maxIoMs: Number(p[10]) };
      if (changed) return `XBOX MOTORS: ${p[2]}. ` + ({ waiting: 'Front micro:bit A/B starts; keep sticks centred.',
        input: 'Waiting for controller input.', neutral: 'Centre both control sticks to enable.',
        active: 'Left Y drives M1; right X positions M2. Blue Xbox A toggles override.',
        stale: 'Input quiet; motors stopped. If it timed out during movement, centre the sticks to resume.',
        aborted: 'A+B stop latched; reset to enable again.', fault: `Motor I2C error ${p[8]}; stop attempted; reset required.` }[p[2]]);
      return;
    }
    if (p[0] === 'BP_MOTOR' && p.length === 5 && /^\d+$/.test(p[1]) &&
      ['waiting', 'countdown', 'move', 'stop', 'done', 'fault', 'aborted'].includes(p[2]) &&
      /^[0-4]$/.test(p[3]) && /^-?\d+$/.test(p[4])) {
      const changed = this.motor?.state !== p[2] || this.motor?.step !== Number(p[3]);
      this.motor = { state: p[2], step: Number(p[3]), result: Number(p[4]), deviceMs: Number(p[1]) };
      if (changed) return p[2] === 'waiting'
        ? 'MOTOR BENCH READY: one front A or B press starts the finite M1/M2 sequence. Loose motors only; A+B requests abort.'
        : `MOTOR BENCH: ${p[2]}, step ${p[3]}/4, I2C result ${p[4]}. Physical motion/stopping needs visual confirmation.`;
      return;
    }
    const before = this.state;
    if (p[0] === 'BP_STATUS' && p.length === 6 && p[1] === '1' &&
      ['initializing', 'button-error', 'waiting', 'scanning', 'connected'].includes(p[3]) &&
      [p[2], p[4], p[5]].every(x => /^\d+$/.test(x)) && Number(p[4]) <= 3) {
      const uptime = Number(p[2]);
      if (uptime < this.uptime || p[3] === 'waiting') {
        this.lastInput = null;
        this.sawStart = false;
        if (uptime < this.uptime) { this.motor = null; this.drive = null; }
      }
      this.uptime = uptime;
      this.lastStatusAt = hostMs;
      this.state = p[3];
      this.button = Number(p[4]);
      this.reports = Number(p[5]);
      if (this.state !== before) {
        if (this.state === 'waiting') return 'READY: turn on the controller(s), then press/release micro:bit A or B. Use Pair only for a new pairing. No chat reply needed.';
        if (this.state === 'scanning') {
          this.lastInput = null;
          if (this.sawStart) return before === 'connected'
            ? 'CONTROLLER DISCONNECTED: turn the controller on normally when ready; watching for recovery.'
            : 'SCANNING: the start was already acknowledged; still watching for a controller.';
          this.sawStart = true;
          return `START RECEIVED (${this.button === 1 ? 'A' : this.button === 2 ? 'B' : 'A+B'}): watching for a controller connection.`;
        }
        if (this.state === 'connected') {
          this.sawStart = true;
          return 'CONTROLLER READY: input monitoring is active.';
        }
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
      if (/^BP_(STATUS|INPUT|PEERS|PAD|SLOT|READY|GONE|PRIORITY|MOTOR|DRIVE),/.test(line)) await save(true);
      return !line.startsWith('BP_');
    });
  } finally {
    clearInterval(timer);
    await save(false);
  }
}

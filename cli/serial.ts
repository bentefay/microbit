import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Container emits JSON-escaped serial chunks. Neither transport preserves lines. */
export class SerialLines {
  private transport = '';
  private serial = '';
  push(chunk: string): string[] {
    this.transport += chunk;
    const lines: string[] = [];
    let end: number;
    while ((end = this.transport.indexOf('\n')) >= 0) {
      const packet = JSON.parse(this.transport.slice(0, end));
      this.transport = this.transport.slice(end + 1);
      if (typeof packet !== 'string') throw new Error('Unexpected serial transport record');
      this.serial += packet;
      let newline: number;
      while ((newline = this.serial.indexOf('\n')) >= 0) {
        lines.push(this.serial.slice(0, newline).trim());
        this.serial = this.serial.slice(newline + 1);
      }
      if (this.serial.length > 65536) throw new Error('Serial line exceeds capture limit');
    }
    if (this.transport.length > 65536) throw new Error('Serial transport exceeds capture limit');
    return lines;
  }
  get incomplete() { return !!(this.transport || this.serial); }
}

export async function captureSerial(argv: string[], directory: string, label: string) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}-${randomUUID().slice(0, 8)}.jsonl`);
  const output = await open(file, 'wx', 0o600);
  const start = performance.now();
  const write = (record: unknown) => output.write(JSON.stringify(record) + '\n');
  const parser = new SerialLines();
  const decoder = new TextDecoder();
  const stats: Record<string, { count: number; min: number; max: number; last: number; timeouts: number }> = {};
  console.log(`Recording: ${file}\nOnly changed values are printed; every complete line is saved. Times are host receipt times, not radio timestamps.`);
  const child = Bun.spawn(argv, { stdin: 'ignore', stdout: 'pipe', stderr: 'inherit' });
  try {
    await write({ type: 'start', time: new Date().toISOString(), label });
    for await (const chunk of child.stdout) {
      for (const line of parser.push(decoder.decode(chunk, { stream: true }))) {
        const ms = Math.round(performance.now() - start);
        await write({ type: 'line', ms, line });
        if (line.startsWith('LAT_SAMPLE,')) continue; // Preserve full-rate encoder data without flooding the terminal.
        const match = /^(leftY_raw|rightX_raw):\s*(-?\d+)$/.exec(line);
        if (match) {
          const [, axis, raw] = match;
          const value = Number(raw);
          const before = stats[axis];
          if (!before || before.last !== value) console.log(`${(ms / 1000).toFixed(1)}s ${axis}=${value}`);
          stats[axis] = { count: (before?.count || 0) + 1, min: Math.min(before?.min ?? value, value), max: Math.max(before?.max ?? value, value), last: value, timeouts: (before?.timeouts || 0) + (value === -1 ? 1 : 0) };
        } else console.log(`${(ms / 1000).toFixed(1)}s ${JSON.stringify(line)}`);
      }
    }
    const code = await child.exited;
    await write({ type: 'end', ms: Math.round(performance.now() - start), code, incomplete: parser.incomplete, stats });
    console.log('Summary:', JSON.stringify(stats));
    if (parser.incomplete) console.log('Capture ended with a partial line; it was excluded.');
    if (code) throw new Error(`Serial collector exited ${code}`);
  } finally { child.kill(); await output.close(); }
}

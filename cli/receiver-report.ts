type Frame = { seq: number; profile: number; start: number; end: number; x: number; y: number };
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted.length ? sorted[Math.ceil((sorted.length - 1) * p)] : null;
  return { count: sorted.length, min: at(0), median: at(.5), p95: at(.95), max: at(1) };
}

/** Uses device timestamps. Repeated values are observations, NOT proof of stale radio packets. */
export function receiverReport(jsonl: string) {
  const frames: Frame[] = [], reads: number[][] = [];
  for (const line of jsonl.trim().split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.type !== 'line' || typeof record.line !== 'string') continue;
    const [kind, ...fields] = record.line.split(',');
    if (kind !== 'RX_FRAME' && kind !== 'RX_READ') continue;
    const n = fields.map(Number);
    if (fields.some((f: string) => f.trim() === '') || !n.every(Number.isInteger)) throw new Error('Malformed receiver record');
    if (n[0] < 1 || n[1] < 0 || n[1] > 5) throw new Error('Invalid sequence/profile');
    if (kind === 'RX_FRAME') {
      if (n.length !== 7 || n[2] < 0 || n[3] < n[2] || n.slice(4).some(v => v < -1 || v > 255)) throw new Error('Invalid receiver frame');
      frames.push({ seq: n[0], profile: n[1], start: n[2], end: n[3], x: n[4], y: n[5] });
    } else {
      if (n.length !== 13 || ![25, 27, 28].includes(n[2]) || n[3] < 0 || n[4] < n[3] || n[5] < -3 || n[5] > 255)
        throw new Error('Invalid receiver read');
      reads.push(n);
    }
  }
  const results: unknown[] = [];
  for (let profile = 0; profile < 6; profile++) {
    const f = frames.filter(f => f.profile === profile), r = reads.filter(r => r[1] === profile);
    if (!f.length && !r.length) continue;
    const cycles: number[] = [], unchanged: number[] = [], changes: number[] = [];
    const centers: { startMs: number; observedSpanMs: number; samples: number }[] = [];
    let first: Frame | undefined, prev: Frame | undefined;
    let center: typeof centers[number] | undefined;
    for (const frame of f) {
      // Do not bridge capture gaps, resets, incomplete frames, or profile switches.
      const valid = frame.x >= 0 && frame.y >= 0;
      const contiguous = valid && prev && frame.seq === prev.seq + 1 && frame.start > prev.start && prev.x >= 0 && prev.y >= 0;
      if (!contiguous) {
        if (first && prev) unchanged.push(prev.end - first.end);
        first = valid ? frame : undefined;
        center = undefined;
      } else {
        cycles.push(frame.start - prev!.start);
        if (frame.x !== prev!.x || frame.y !== prev!.y) {
          if (first) { unchanged.push(prev!.end - first.end); changes.push(frame.end - first.end); }
          first = frame;
        }
      }
      if (valid && frame.x === 128 && frame.y === 128) {
        if (!center) { center = { startMs: frame.end, observedSpanMs: 0, samples: 0 }; centers.push(center); }
        center.samples++;
        center.observedSpanMs = frame.end - center.startMs;
      } else center = undefined;
      prev = frame;
    }
    if (first && prev) unchanged.push(prev.end - first.end);
    results.push({ profile, frames: f.length, reads: r.length,
      cycleMs: summary(cycles), identicalXYObservedSpanMs: summary(unchanged), xyChangeIntervalMs: summary(changes),
      centers, readErrors: r.filter(r => r[5] < 0).map(r => ({ sequence: r[0], command: r[2], result: r[5], nativeStatus: r[12] })),
      attempts: summary(r.map(r => r[6])), readinessMs: summary(r.map(r => r[9])),
      writeMs: summary(r.map(r => r[10])), responseMs: summary(r.map(r => r[11])),
      wholeReadMs: summary(r.map(r => r[4] - r[3])),
      nonReadyFirstBytes: [...new Set(r.map(r => r[7]).filter(v => v !== 16))] });
  }
  return results;
}

/** Analysis of firmware timestamps; host serial receipt times are deliberately unused. */
type Cue = { trial: number; time: number; direction: number; previousRaw: number };
type Sample = { trial: number; input: number; raw: number; drive: number; command: number; encoder: number; angle: number };
export function latencyReport(jsonl: string) {
  const cues: Cue[] = [], samples: Sample[] = [];
  for (const record of jsonl.split('\n').filter(Boolean)) {
    const line = JSON.parse(record).line;
    if (typeof line !== 'string') continue;
    const [kind, ...fields] = line.split(',');
    const v = fields.map(Number);
    if (v.some(n => !Number.isFinite(n))) continue;
    if (kind === 'LAT_CUE' && v.length === 4) cues.push({ trial: v[0], time: v[1], direction: v[2], previousRaw: v[3] });
    if (kind === 'LAT_SAMPLE' && v.length === 7) samples.push({ trial: v[0], input: v[1], raw: v[2], drive: v[3], command: v[4], encoder: v[5], angle: v[6] });
  }
  if (!cues.length) throw new Error('No LAT_CUE records found; capture the guided latency firmware.');
  if (cues.some((c, i) => i > 0 && (c.time <= cues[i - 1].time || c.trial <= cues[i - 1].trial))) {
    throw new Error('Capture contains multiple runs or non-monotonic cue times; use a separate capture per run.');
  }
  return cues.map(cue => {
    const row = { trial: cue.trial, cue: cue.direction > 0 ? 'L ↑' : 'L ↓', cueToInputMs: null as number | null,
      inputToCommandMs: null as number | null, encoderResponseMs: 'unresolved', note: '' };
    if ((128 - cue.previousRaw) * cue.direction > 8) {
      row.note = 'Stick already pointed in requested direction at cue'; return row;
    }
    const received = samples.find(s => s.trial === cue.trial && s.input >= cue.time && s.drive * cue.direction > 0);
    if (!received) { row.note = 'No matching nonzero drive input captured'; return row; }
    row.cueToInputMs = received.input - cue.time;
    row.inputToCommandMs = received.command - received.input;
    const before = samples.filter(s => s.encoder < received.command && s.encoder >= received.command - 500);
    const deltas = before.slice(1).map((s, i) => ({ time: s.encoder, delta: s.angle - before[i].angle }));
    const moving = deltas.filter(d => Math.abs(d.delta) >= 2 && Math.abs(d.delta) <= 1800);
    const recent = moving.slice(-3);
    const baselineSign = recent.length && recent.at(-1)!.time >= received.command - 200 &&
      recent.every(d => Math.sign(d.delta) === Math.sign(recent[0].delta)) ? Math.sign(recent[0].delta) : 0;
    if (!baselineSign && cue.trial !== 1) {
      row.note = 'No consistent moving encoder baseline for reversal'; return row;
    }
    const after = samples.filter(s => s.trial === cue.trial && s.encoder >= received.command);
    let previous = before.at(-1);
    let candidate: { low: number; high: number; sign: number } | undefined;
    for (const sample of after) {
      if (!previous) { previous = sample; continue; }
      const delta = sample.angle - previous.angle;
      if (Math.abs(delta) > 1800) { row.note = 'Encoder discontinuity; response not trusted'; return row; }
      const sign = Math.abs(delta) >= 2 ? Math.sign(delta) : 0;
      // First trial is movement from rest. Later trials require reversing the prior encoder direction.
      const matches = sign !== 0 && (!baselineSign || sign === -baselineSign);
      if (matches) {
        if (candidate && candidate.sign === sign) {
          row.encoderResponseMs = `${candidate.low}–${candidate.high}`;
          row.note = baselineSign ? 'Encoder reversal, confirmed by next moving sample' : 'Initial movement from rest';
          return row;
        }
        candidate = { low: Math.max(0, previous.encoder - received.command), high: sample.encoder - received.command, sign };
      } else candidate = undefined;
      previous = sample;
    }
    row.note = 'No confirmed encoder response before the next cue';
    return row;
  });
}

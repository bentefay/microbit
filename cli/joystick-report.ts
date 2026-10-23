/** Summarize the normal firmware's sparse CAR_STATE snapshots, not raw radio frames. */
export function joystickReport(jsonl: string) {
  const samples: { ms: number; stick: number; x: number; y: number; cycle: number; read: number }[] = [];
  for (const record of jsonl.split('\n').filter(Boolean)) {
    const data = JSON.parse(record);
    if (data.type !== 'line' || typeof data.line !== 'string' || !data.line.startsWith('CAR_STATE,')) continue;
    const v = data.line.split(',').slice(1).map(Number);
    if (v.length !== 9 || v.some((n: number) => !Number.isFinite(n)) || ![0, 1].includes(v[1])) {
      throw new Error('Invalid CAR_STATE record');
    }
    const x = v[1] === 0 ? v[4] : v[3], y = v[1] === 0 ? v[2] : v[4];
    if ([x, y].some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('Invalid joystick byte');
    samples.push({ ms: data.ms, stick: v[1], x, y, cycle: v[7], read: v[8] });
  }
  if (!samples.length) throw new Error('No CAR_STATE samples in capture');
  const range = (values: number[]) => [Math.min(...values), Math.max(...values)];
  return [0, 1].filter(stick => samples.some(s => s.stick === stick)).map(stick => {
    const rows = samples.filter(s => s.stick === stick);
    const normalized = (raw: number) => (raw - 128) / (raw < 128 ? 128 : 127);
    return {
      stick: stick === 0 ? 'left' : 'right', samples: rows.length,
      rawX: range(rows.map(s => s.x)), rawY: range(rows.map(s => s.y)),
      exactCenterSeconds: rows.filter(s => s.x === 128 && s.y === 128).map(s => +(s.ms / 1000).toFixed(3)),
      radiusBelow90Percent: rows.filter(s => Math.hypot(normalized(s.x), normalized(s.y)) < 0.9)
        .map(s => ({ seconds: +(s.ms / 1000).toFixed(3), rawX: s.x, rawY: s.y,
          normalizedRadius: +Math.hypot(normalized(s.x), normalized(s.y)).toFixed(3) })),
      reportedCycleMaximaMs: range(rows.map(s => s.cycle)),
      reportedReadMaximaMs: range(rows.map(s => s.read)),
    };
  });
}

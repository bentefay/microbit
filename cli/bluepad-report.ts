export function bluepadReport(text: string) {
  const fresh = () => ({ state: 'unknown', button: 0, snapshots: 0,
    axes: Array.from({ length: 4 }, () => ({ min: Infinity, max: -Infinity })),
    triggers: [0, 0], buttons: 0, dpad: 0, neutralSince: null as number | null,
    lastInputTime: null as number | null });
  let result = fresh();
  let lastStatusTime = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let record: any;
    try { record = JSON.parse(raw); } catch { continue; }
    if (record.type !== 'line' || typeof record.line !== 'string') continue;
    const p = record.line.split(',');
    if (p[0] === 'BP_STATUS' && p.length === 6 && p[1] === '1' &&
      [p[2], p[4], p[5]].every(x => /^\d+$/.test(x))) {
      const time = Number(p[2]);
      if (time < lastStatusTime) result = fresh();
      lastStatusTime = time;
      result.state = p[3];
      result.button = Number(p[4]);
    }
    if (p[0] !== 'BP_INPUT' || p.length !== 12 || !p.slice(1).every(x => /^-?\d+$/.test(x))) continue;
    const n = p.slice(1).map(Number);
    result.snapshots++;
    n.slice(2, 6).forEach((value, i) => {
      result.axes[i].min = Math.min(result.axes[i].min, value);
      result.axes[i].max = Math.max(result.axes[i].max, value);
    });
    result.triggers[0] = Math.max(result.triggers[0], n[6]);
    result.triggers[1] = Math.max(result.triggers[1], n[7]);
    result.buttons |= n[8]; result.dpad |= n[9];
    const neutral = n.slice(2, 6).every(v => Math.abs(v) <= 64) &&
      n[6] <= 64 && n[7] <= 64 && n.slice(8).every(v => v === 0);
    if (!neutral || (result.lastInputTime !== null && n[0] - result.lastInputTime > 500))
      result.neutralSince = null;
    if (neutral && result.neutralSince === null) result.neutralSince = n[0];
    result.lastInputTime = n[0];
  }
  const checks = {
    sticks: result.axes.every(a => a.min <= -400 && a.max >= 400),
    triggers: result.triggers.every(v => v >= 900),
    faceButtons: (result.buttons & 15) === 15,
    dpad: (result.dpad & 15) === 15,
    returnedToNeutral: result.neutralSince !== null && result.lastInputTime! - result.neutralSince >= 200,
  };
  return { ...result, checks, inputExerciseComplete: Object.values(checks).every(Boolean),
    limitation: 'Sampled control coverage only. Does not establish physical latency, radio-loss response or motor readiness.' };
}

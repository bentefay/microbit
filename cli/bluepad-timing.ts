/** Estimates callback cadence between snapshots, never physical input latency. */
export function bluepadTiming(text: string) {
  const sessions: { controller: string; windows: number[]; reports: number; ms: number }[] = [];
  let current: typeof sessions[number] | undefined;
  let previous: number[] | undefined;
  for (const raw of text.split('\n')) {
    let record: any;
    try { record = JSON.parse(raw); } catch { continue; }
    if (record.type !== 'line' || typeof record.line !== 'string') continue;
    const line = record.line as string;
    if (line.includes('Booting Zephyr OS') || line.startsWith('BP_DISCONNECTED,')) {
      current = undefined; previous = undefined;
    }
    const connected = /^Device ([0-9A-F:]{17}) is connected$/.exec(line);
    if (connected) {
      current = { controller: connected[1], windows: [], reports: 0, ms: 0 };
      sessions.push(current); previous = undefined;
    }
    const p = line.split(',');
    if (!current || p[0] !== 'BP_INPUT' || p.length !== 12 || !p.slice(1).every(x => /^-?\d+$/.test(x))) continue;
    const n = p.slice(1).map(Number);
    if (previous) {
      const ms = n[0] - previous[0], count = n[1] - previous[1];
      const moving = n.slice(2, 6).some((v, i) => Math.abs(v - previous![i + 2]) >= 16);
      if (moving && ms >= 90 && ms <= 250 && count > 0) {
        current.windows.push(ms / count);
        current.ms += ms; current.reports += count;
      }
    }
    previous = n;
  }
  return sessions.map((s, index) => {
    const sorted = [...s.windows].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = !sorted.length ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { session: index + 1, controller: s.controller, movingWindows: sorted.length,
      medianMeanCallbackSpacingMs: median,
      aggregateCallbacksPerSecond: s.ms ? s.reports * 1000 / s.ms : null,
      limitation: 'Estimated from device timestamps and report-counter deltas in 90–250 ms snapshots with changing axes. Not individual-packet jitter, connection interval or stick-to-LED latency.' };
  });
}

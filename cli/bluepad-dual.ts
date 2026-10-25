type Pad = { address: string; reports: number; updatesWhileBothConnected: number;
  snapshots: number; lastInput: number[] | null };
export class DualPads {
  mask = 0;
  owner = -1;
  everBoth = false;
  emptyAfterBoth = false;
  recoveredAfterEmpty = false;
  pads: Record<string, Pad> = {};
  masksSeen: number[] = [];
  connectionsByAddress: Record<string, number> = {};
  soloSnapshotsByAddress: Record<string, number> = {};
  priority: { latched: boolean; supervisorSlot: number } | null = null;
  priorityChanges: { deviceMs: number; latched: boolean; supervisorSlot: number; owner: number }[] = [];
  private uptime = 0;
  push(line: string): string | undefined {
    const p = line.split(',');
    if (line.includes('Booting Zephyr OS') || (p[0] === 'BP_STATUS' && /^\d+$/.test(p[2]) && Number(p[2]) < this.uptime)) {
      this.mask = 0; this.owner = -1; this.everBoth = false; this.pads = {}; this.uptime = 0;
      this.emptyAfterBoth = false; this.recoveredAfterEmpty = false;
      this.masksSeen = []; this.connectionsByAddress = {}; this.soloSnapshotsByAddress = {};
      this.priority = null; this.priorityChanges = [];
    }
    if (p[0] === 'BP_STATUS' && /^\d+$/.test(p[2])) this.uptime = Number(p[2]);
    if (p[0] === 'BP_PRIORITY' && p.length === 4 && /^\d+$/.test(p[1]) &&
      ['0', '1'].includes(p[2]) && ['-1', '0', '1'].includes(p[3])) {
      const next = { latched: p[2] === '1', supervisorSlot: Number(p[3]) };
      if (!this.priority || this.priority.latched !== next.latched || this.priority.supervisorSlot !== next.supervisorSlot) {
        this.priorityChanges.push({ deviceMs: Number(p[1]), ...next, owner: this.owner });
        if (this.priorityChanges.length > 32) this.priorityChanges.shift();
      }
      this.priority = next;
    }
    if (p[0] === 'BP_PEERS' && p.length === 4 && /^\d+$/.test(p[1]) &&
      ['0', '1', '2', '3'].includes(p[2]) && ['-1', '0', '1'].includes(p[3])) {
      const mask = Number(p[2]), owner = Number(p[3]);
      if (owner >= 0 && !(mask & (1 << owner))) return;
      const changed = this.mask !== mask;
      this.mask = mask; this.owner = owner; this.everBoth ||= mask === 3;
      if (mask === 0 && this.everBoth) this.emptyAfterBoth = true;
      if (mask === 3 && this.emptyAfterBoth) this.recoveredAfterEmpty = true;
      if (!this.masksSeen.includes(mask)) this.masksSeen.push(mask);
      if (changed) return `${Number(!!(mask & 1)) + Number(!!(mask & 2))} CONTROLLER(S) CONNECTED; LED owner: ${owner < 0 ? 'waiting for input' : owner + 1}.`;
    }
    const slot = p[2];
    if (!['0', '1'].includes(slot)) return;
    if ((p[0] === 'BP_READY' && p.length === 4 || p[0] === 'BP_SLOT' && p.length === 6) &&
      /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(p[3])) {
      if (!this.pads[slot] || this.pads[slot].address !== p[3] || p[0] === 'BP_READY')
        this.pads[slot] = { address: p[3], reports: 0, updatesWhileBothConnected: 0, snapshots: 0, lastInput: null };
      if (p[0] === 'BP_READY') this.connectionsByAddress[p[3]] = (this.connectionsByAddress[p[3]] ?? 0) + 1;
      if (p[0] === 'BP_SLOT' && p.slice(4).every(x => /^\d+$/.test(x))) {
        this.pads[slot].reports = Number(p[4]);
        this.pads[slot].updatesWhileBothConnected = Number(p[5]);
      }
    }
    if (p[0] === 'BP_PAD' && p.length === 13 && p.slice(1).every(x => /^-?\d+$/.test(x)) && this.pads[slot]) {
      const pad = this.pads[slot];
      pad.reports = Number(p[3]); pad.snapshots++;
      pad.lastInput = p.slice(4).map(Number);
      if (this.mask === (1 << Number(slot)))
        this.soloSnapshotsByAddress[pad.address] = (this.soloSnapshotsByAddress[pad.address] ?? 0) + 1;
    }
  }
  result() {
    return { mask: this.mask, owner: this.owner, everBoth: this.everBoth, pads: this.pads,
      emptyAfterBoth: this.emptyAfterBoth, recoveredAfterEmpty: this.recoveredAfterEmpty,
      masksSeen: this.masksSeen, connectionsByAddress: this.connectionsByAddress,
      soloSnapshotsByAddress: this.soloSnapshotsByAddress,
      priority: this.priority, priorityChanges: this.priorityChanges,
      bothDroveDisplayWhileConnected: this.everBoth && ['0', '1'].every(i => (this.pads[i]?.updatesWhileBothConnected ?? 0) > 0),
      limitation: 'Framebuffer writes prove the software selection path, not visible LED onset or radio latency.' };
  }
}
export function bluepadDualReport(text: string) {
  const state = new DualPads();
  for (const raw of text.split('\n')) {
    let r: any; try { r = JSON.parse(raw); } catch { continue; }
    if (r.type === 'line' && typeof r.line === 'string') state.push(r.line);
  }
  return state.result();
}

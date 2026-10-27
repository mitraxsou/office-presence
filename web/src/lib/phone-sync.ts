/** Per-device phone sync times for a correction day. Times only, never coordinates. */

export type SyncEventLike = {
  recordedAt: Date;
  deviceName: string | null;
  deviceTokenId?: string | null;
};

export type PhoneSyncDeviceRow = {
  device: string;
  lastBeforeIn: string | null;
  firstAfterOut: string | null;
};

/**
 * For each device that has events that day, return the last event before requested In
 * and the first event after requested Out (ISO times only).
 */
export function phoneSyncPerDevice(
  events: SyncEventLike[],
  requestedIn: Date,
  requestedOut: Date,
): PhoneSyncDeviceRow[] {
  const byDevice = new Map<string, Date[]>();
  for (const e of events) {
    const key = (e.deviceName && e.deviceName.trim()) || e.deviceTokenId || "Unknown device";
    const list = byDevice.get(key) ?? [];
    list.push(e.recordedAt);
    byDevice.set(key, list);
  }
  const inMs = requestedIn.getTime();
  const outMs = requestedOut.getTime();
  const rows: PhoneSyncDeviceRow[] = [];
  for (const [device, times] of [...byDevice.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
    let lastBefore: Date | null = null;
    let firstAfter: Date | null = null;
    for (const t of sorted) {
      const ms = t.getTime();
      if (ms < inMs) lastBefore = t;
      if (ms > outMs && firstAfter == null) firstAfter = t;
    }
    rows.push({
      device,
      lastBeforeIn: lastBefore?.toISOString() ?? null,
      firstAfterOut: firstAfter?.toISOString() ?? null,
    });
  }
  return rows;
}

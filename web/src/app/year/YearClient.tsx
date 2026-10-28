"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { visitDaysFyi } from "@/lib/points-format";
import { fmtHours } from "@/lib/format";

type MonthRow = {
  month: string;
  label: string;
  points: number;
  visitDays: number;
  targetMet: boolean;
  isCurrent: boolean;
  isFuture: boolean;
};
type OfficeRow = {
  officeLocationId: string | null;
  name: string;
  visitDays: number;
  points: number;
  pointsPerVisitDay: number;
};
type WeekdayRow = { weekday: number; label: string; visitDays: number };
type YearData = {
  year: number;
  generatedAt: string;
  pointsTarget: number;
  currentMonth: string;
  yearsWithData: number[];
  summary: {
    points: number;
    visitDays: number;
    monthsMet: number;
    monthsElapsed: number;
    targetSoFar: number;
    pointsThisMonth: number;
    toGoThisMonth: number;
    currentMonthLabel: string;
  };
  months: MonthRow[];
  offices: OfficeRow[];
  weekdays: WeekdayRow[];
  visitDayKeys: string[];
  usualArrival: string | null;
  usualLeaving: string | null;
  averageHoursPerVisitDay: number;
  multiOfficeDays: number;
  correctionRequests: number;
  correctionApproved: number;
  adminEditedDays: number;
};

const CACHE_KEY = "op-year-cache";
const SYNC_AT_KEY = "op-year-sync-at";
const SYNC_OK_KEY = "op-last-successful-sync-at";
const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;

function updatedAgo(atMs: number): string {
  if (!atMs) return "Not synced yet";
  const mins = Math.max(0, Math.floor((Date.now() - atMs) / 60_000));
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 min ago";
  if (mins < 60) return `Updated ${mins} min ago`;
  if (mins < 120) return "Updated 1 h ago";
  if (mins < 24 * 60) return `Updated ${Math.floor(mins / 60)} h ago`;
  return `Updated ${Math.floor(mins / (24 * 60))} d ago`;
}

function readCache(year: number): YearData | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}:${year}`);
    if (!raw) return null;
    return JSON.parse(raw) as YearData;
  } catch {
    return null;
  }
}

function writeCache(year: number, data: YearData) {
  try {
    sessionStorage.setItem(`${CACHE_KEY}:${year}`, JSON.stringify(data));
    sessionStorage.setItem(SYNC_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function lastSyncMs(): number {
  try {
    return Number(sessionStorage.getItem(SYNC_AT_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

function lastOkSyncMs(): number {
  try {
    return Number(sessionStorage.getItem(SYNC_OK_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

function markOkSync() {
  try {
    const now = String(Date.now());
    sessionStorage.setItem(SYNC_OK_KEY, now);
    sessionStorage.setItem(SYNC_AT_KEY, now);
  } catch {
    /* ignore */
  }
}

export default function YearClient({ greetingText }: { greetingText?: string }) {
  const router = useRouter();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<YearData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const canSync = Date.now() - lastOkSyncMs() >= COOLDOWN_MS;

  const load = useCallback(async (y: number, opts?: { force?: boolean }) => {
    setYear(y);
    setErr(null);
    const cached = readCache(y);
    if (cached && !opts?.force) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const stale = Date.now() - lastSyncMs() > DAY_MS;
    if (opts?.force || stale || !cached) {
      try {
        if (opts?.force || stale) {
          await fetch("/api/me/sync", { cache: "no-store" });
          markOkSync();
        }
        const res = await fetch(`/api/me/year?year=${y}`, { cache: "no-store" });
        if (!res.ok) {
          setErr("Could not load");
          setLoading(false);
          return;
        }
        const json = (await res.json()) as YearData;
        setData(json);
        writeCache(y, json);
        setLoading(false);
      } catch {
        if (!cached) setErr("Could not load");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(year);
  }, [year, load]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const syncNow = async () => {
    if (!canSync || syncing) return;
    setSyncing(true);
    await load(year, { force: true });
    setSyncing(false);
  };

  const empty = data && data.summary.points === 0 && data.summary.visitDays === 0;
  const syncLabel = updatedAgo(lastSyncMs());
  void tick;

  const years = useMemo(() => data?.yearsWithData ?? [year], [data, year]);

  return (
    <div className="op-year">
      <div className="op-year-head">
        <div>
          {greetingText ? <div className="help" style={{ marginBottom: 8 }}>{greetingText}</div> : null}
          <div className="op-year-nav">
            <button
              type="button"
              className="btn btn-ghost"
              aria-label="Previous year"
              onClick={() => {
                const prev = years.find((y) => y < year) ?? year - 1;
                setYear(prev);
              }}
            >
              &lt;
            </button>
            <h1 className="op-page-title" style={{ margin: 0 }}>{year}</h1>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label="Next year"
              disabled={year >= new Date().getFullYear()}
              onClick={() => {
                const next = [...years].reverse().find((y) => y > year) ?? year + 1;
                if (next <= new Date().getFullYear()) setYear(next);
              }}
            >
              &gt;
            </button>
          </div>
          <div className="help">{syncLabel}</div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canSync || syncing}
          onClick={() => void syncNow()}
        >
          {syncing ? "Syncing" : "Sync"}
        </button>
      </div>

      {loading && !data ? <div className="card">Loading year</div> : null}
      {err && !data ? (
        <div className="card">
          <p>{err}</p>
          <button type="button" className="btn" onClick={() => void load(year, { force: true })}>
            Try again
          </button>
        </div>
      ) : null}

      {data && empty ? (
        <div className="card op-year-empty">
          <h2>Your year starts here</h2>
          <p className="help">
            After your first visit day, this page shows points by month, offices, and the days you usually come in.
          </p>
        </div>
      ) : null}

      {data && !empty ? (
        <div className="op-year-grid">
          <div className="card">
            <div className="op-year-summary-top">
              <div className="op-year-points">
                {data.summary.points === 1 ? "1 point" : `${data.summary.points} points`}
              </div>
              <div className="help">
                {data.summary.visitDays === 1
                  ? "1 visit day so far this year"
                  : `${data.summary.visitDays} visit days so far this year`}
              </div>
            </div>
            <div className="op-year-summary-stats">
              <span>{data.summary.monthsMet} of {data.summary.monthsElapsed} months met</span>
              <span>{data.summary.targetSoFar} target so far</span>
              <span>
                {data.summary.toGoThisMonth <= 0
                  ? `Goal met for ${data.summary.currentMonthLabel}`
                  : `${data.summary.toGoThisMonth} to go for ${data.summary.currentMonthLabel}`}
              </span>
            </div>
          </div>

          <PointsByMonthChart
            months={data.months}
            target={data.pointsTarget}
            onOpenMonth={(m) => router.push(`/month?month=${m}`)}
          />

          <OfficesBlock offices={data.offices} />

          <Heatmap
            year={data.year}
            keys={new Set(data.visitDayKeys)}
            onOpenMonth={(m) => router.push(`/month?month=${m}`)}
          />

          <div className="card">
            <StatLine label="Usual arrival" value={data.usualArrival} />
            <StatLine label="Usual leaving" value={data.usualLeaving} />
            <StatLine
              label="Average hours per visit day"
              value={data.averageHoursPerVisitDay > 0 ? fmtHours(data.averageHoursPerVisitDay) : null}
            />
            <StatLine label="Days with 2 or more offices" value={String(data.multiOfficeDays)} />
            {data.correctionRequests > 0 ? (
              <StatLine
                label="Correction requests"
                value={`${data.correctionRequests} sent, ${data.correctionApproved} approved`}
              />
            ) : null}
            {data.adminEditedDays > 0 ? (
              <StatLine label="Days edited by an admin" value={String(data.adminEditedDays)} />
            ) : null}
            <div className="help" style={{ marginTop: 8 }}>{visitDaysFyi(data.summary.visitDays)}</div>
          </div>

          <WeekdayBars weekdays={data.weekdays} />
        </div>
      ) : null}

      {data && empty ? (
        <div className="card" style={{ marginTop: 16 }}>
          <PointsByMonthChart
            months={data.months}
            target={data.pointsTarget}
            onOpenMonth={(m) => router.push(`/month?month=${m}`)}
          />
        </div>
      ) : null}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="op-year-stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function PointsByMonthChart({
  months,
  target,
  onOpenMonth,
}: {
  months: MonthRow[];
  target: number;
  onOpenMonth: (m: string) => void;
}) {
  const max = Math.max(target, ...months.map((m) => m.points), 1);
  return (
    <div className="card">
      <div className="op-year-card-head">
        <h2>Points by month</h2>
        <span className="help"><span className="op-year-dot ok" /> Goal met</span>
      </div>
      <div className="op-year-bars" role="img" aria-label="Points by month">
        <div className="op-year-target-line" style={{ bottom: `${(target / max) * 100}%` }}>
          <span>{target} points</span>
        </div>
        {months.map((m) => (
          <button
            key={m.month}
            type="button"
            className={`op-year-bar${m.isCurrent ? " current" : ""}${m.isFuture ? " future" : ""}`}
            disabled={m.isFuture}
            onClick={() => onOpenMonth(m.month)}
            title={`${m.month}: ${m.points} points`}
          >
            <span
              className="op-year-bar-fill"
              style={{ height: m.isFuture || m.points <= 0 ? 4 : `${(m.points / max) * 100}%` }}
            />
            {m.targetMet ? <span className="op-year-dot ok under" /> : <span className="op-year-dot under" />}
            <span className="op-year-bar-label">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="help">Click a month to open it in My month.</p>
    </div>
  );
}

function OfficesBlock({ offices }: { offices: OfficeRow[] }) {
  if (!offices.length) return null;
  const max = Math.max(...offices.map((o) => o.points), 1);
  return (
    <div className="card">
      <h2>Offices this year</h2>
      {offices.map((o) => {
        const dayBit = o.visitDays === 1 ? "1 visit day" : `${o.visitDays} visit days`;
        const perBit = o.pointsPerVisitDay === 1 ? "1 point each" : `${o.pointsPerVisitDay} points each`;
        return (
          <div key={o.officeLocationId ?? o.name} className="op-year-office">
            <div className="op-year-office-row">
              <b>{o.name}</b>
              <b>{o.points === 1 ? "1 point" : `${o.points} points`}</b>
            </div>
            <div className="op-year-office-track">
              <div className="op-year-office-fill" style={{ width: `${(o.points / max) * 100}%` }} />
            </div>
            <div className="help">{dayBit}, {perBit}</div>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({
  year,
  keys,
  onOpenMonth,
}: {
  year: number;
  keys: Set<string>;
  onOpenMonth: (m: string) => void;
}) {
  const cells: Array<{ key: string; month: string; visited: boolean }> = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    const wd = d.getUTCDay(); // 0 Sun
    if (wd === 0 || wd === 6) continue;
    cells.push({ key, month: `${y}-${m}`, visited: keys.has(key) });
  }
  return (
    <div className="card">
      <h2>Visit days, weekdays</h2>
      <p className="help">Click a month to open it in My month.</p>
      <div className="op-year-heat">
        {cells.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`op-year-heat-cell${c.visited ? " on" : ""}`}
            aria-label={c.key}
            onClick={() => onOpenMonth(c.month)}
          />
        ))}
      </div>
    </div>
  );
}

function WeekdayBars({ weekdays }: { weekdays: WeekdayRow[] }) {
  const max = Math.max(...weekdays.map((w) => w.visitDays), 1);
  return (
    <div className="card">
      <h2>Days you come in</h2>
      <p className="help">Visit days by weekday</p>
      <div className="op-year-weekday">
        {weekdays.map((w) => (
          <div key={w.weekday} className="op-year-weekday-col">
            <div
              className={`op-year-weekday-bar${w.visitDays === max && w.visitDays > 0 ? " top" : ""}`}
              style={{ height: `${(w.visitDays / max) * 100}%` }}
            />
            <span>{w.visitDays}</span>
            <span className="help">{w.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

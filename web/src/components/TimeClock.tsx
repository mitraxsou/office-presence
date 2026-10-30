"use client";

import { useEffect, useId, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseHm(value: string): { h: number; m: number } {
  const [hs, ms] = value.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { h: 9, m: 0 };
  return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
}

function fmt12(h: number, m: number) {
  const ap = h >= 12 ? "pm" : "am";
  const hr = h % 12 || 12;
  return `${hr}:${pad(m)} ${ap}`;
}

function deltaWords(from: number, to: number) {
  let d = to - from;
  if (d > 12 * 60) d -= 24 * 60;
  if (d < -12 * 60) d += 24 * 60;
  const abs = Math.abs(d);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const bits = [h ? `${h} h` : "", m ? `${m} m` : ""].filter(Boolean).join(" ");
  if (!bits || d === 0) return "Same time";
  return d < 0 ? `${bits} earlier` : `${bits} later`;
}

export default function TimeClock({
  label,
  value,
  onChange,
  previous,
}: {
  label: string;
  value: string;
  onChange: (hm: string) => void;
  previous?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const start = parseHm(value);
  const [hour, setHour] = useState(start.h);
  const [minute, setMinute] = useState(start.m);
  const [typed, setTyped] = useState(value);

  useEffect(() => {
    const p = parseHm(value);
    setHour(p.h);
    setMinute(p.m);
    setTyped(value);
  }, [value, open]);

  const prev = previous ? parseHm(previous) : null;
  const chip = prev ? deltaWords(prev.h * 60 + prev.m, hour * 60 + minute) : fmt12(hour, minute);
  const hourAngle = ((hour % 12) + minute / 60) * 30;
  const minuteAngle = minute * 6;

  function nudge(delta: number) {
    const total = (hour * 60 + minute + delta + 24 * 60) % (24 * 60);
    setHour(Math.floor(total / 60));
    setMinute(total % 60);
  }

  function commit() {
    const hm = `${pad(hour)}:${pad(minute)}`;
    onChange(hm);
    setOpen(false);
  }

  return (
    <div className="op-clock-field">
      <span className="op-field-lab" id={id}>{label}</span>
      <button type="button" className="op-clock-btn" aria-labelledby={id} onClick={() => setOpen((v) => !v)}>
        <ClockIcon hour={start.h} minute={start.m} />
        <span>{fmt12(start.h, start.m)}</span>
      </button>
      <input
        className="op-input op-input-sm tab"
        aria-label={`${label} typed`}
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          if (/^\d{2}:\d{2}$/.test(e.target.value)) onChange(e.target.value);
        }}
      />
      {open ? (
        <div className="op-clock-pop" role="dialog" aria-label={label}>
          <div className="op-clock-pop-head">
            <span>{label}</span>
            <span className="op-clock-chip">{chip}</span>
          </div>
          <svg viewBox="0 0 200 200" className="op-clock-face" aria-hidden>
            <circle cx="100" cy="100" r="92" fill="none" stroke="var(--op-line-strong)" strokeWidth="2" />
            {prev ? (
              <line
                x1="100"
                y1="100"
                x2={100 + Math.sin((prev.m * 6 * Math.PI) / 180) * 70}
                y2={100 - Math.cos((prev.m * 6 * Math.PI) / 180) * 70}
                stroke="var(--op-ink-3)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            ) : null}
            <line
              x1="100"
              y1="100"
              x2={100 + Math.sin((hourAngle * Math.PI) / 180) * 48}
              y2={100 - Math.cos((hourAngle * Math.PI) / 180) * 48}
              stroke="var(--op-ink)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <line
              x1="100"
              y1="100"
              x2={100 + Math.sin((minuteAngle * Math.PI) / 180) * 72}
              y2={100 - Math.cos((minuteAngle * Math.PI) / 180) * 72}
              stroke="var(--op-accent)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="op-clock-hm">
            <input
              className="op-input op-input-sm tab"
              inputMode="numeric"
              aria-label="Hour"
              value={pad(hour)}
              onChange={(e) => setHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
            />
            <input
              className="op-input op-input-sm tab"
              inputMode="numeric"
              aria-label="Minute"
              value={pad(minute)}
              onChange={(e) => setMinute(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
            />
          </div>
          <div className="op-clock-nudges">
            {[-15, -5, 5, 15].map((n) => (
              <button key={n} type="button" className="btn btn-secondary btn-xs" onClick={() => nudge(n)}>
                {n > 0 ? `+${n} m` : `${n} m`}
              </button>
            ))}
          </div>
          <div className="op-clock-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={commit}>
              Set time
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClockIcon({ hour, minute }: { hour: number; minute: number }) {
  const ha = ((hour % 12) + minute / 60) * 30;
  const ma = minute * 6;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line
        x1="12"
        y1="12"
        x2={12 + Math.sin((ha * Math.PI) / 180) * 4}
        y2={12 - Math.cos((ha * Math.PI) / 180) * 4}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="12"
        x2={12 + Math.sin((ma * Math.PI) / 180) * 6}
        y2={12 - Math.cos((ma * Math.PI) / 180) * 6}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

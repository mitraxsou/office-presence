"use client";

import {
  groupOfficesFromIntervals,
  timelinePct,
  timelineSegments,
  type DayInterval,
} from "@/lib/office-day";

const TONE_CLASS = ["a", "b", "c"] as const;

export function DayTimeline({
  intervals,
  timezone,
  showLegend = true,
}: {
  intervals: DayInterval[];
  timezone: string;
  showLegend?: boolean;
}) {
  if (!intervals.length) return null;
  const { startMin, endMin, labels, segs } = timelineSegments(intervals, timezone);
  const groups = groupOfficesFromIntervals(intervals);
  return (
    <div className="op-tl-wrap">
      <div className="op-tl" aria-hidden>
        {segs.map((s, i) => {
          const left = timelinePct(s.startMin, startMin, endMin);
          const width = Math.max(0.8, timelinePct(s.endMin, startMin, endMin) - left);
          return (
            <i
              key={i}
              className={TONE_CLASS[s.tone] ?? "a"}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
      <div className="op-tlx">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {showLegend && groups.length >= 2 ? (
        <div className="op-tl-legend">
          {groups.map((g, i) => (
            <span key={g.key} className="op-tl-leg">
              <i className={TONE_CLASS[Math.min(i, 2) as 0 | 1 | 2]} />
              {g.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Server component. No client JS: the fill animation is CSS only.
import styles from "./DaysMeter.module.css";
import { StatusBadge } from "./StatusBadge";

type Props = { days: number; target: number; size?: "lg" | "md" | "inline"; caption?: string };

export function DaysMeter({ days, target, size = "lg", caption }: Props) {
  const met = days >= target;
  const pct = target > 0 ? Math.min(days / target, 1) * 100 : 0;
  const label = `${days} of ${target} days, ${met ? "goal met" : `${target - days} to go`}`;

  if (size === "inline") {
    return (
      <div className={styles.inline} aria-label={label}>
        <div className={styles.track} style={{ width: 64, height: 6 }}><i style={{ width: `${pct}%` }} /></div>
        <span className={styles.inlineValue}>{days} / {target}</span>
        {met && <StatusBadge kind="goalMet" compact />}
      </div>
    );
  }

  return (
    <div className={`${styles.meter} ${styles[size]}`} role="img" aria-label={label}>
      <div className={styles.top}>
        <div>
          <span className={styles.number}>{days}</span>
          <span className={styles.den}>/ {target} days</span>
        </div>
        {met ? <StatusBadge kind="goalMet" /> : <span className={styles.toGo}>{target - days} to go</span>}
      </div>
      <div className={styles.track}><i style={{ width: `${pct}%` }} /></div>
      {caption && <p className={styles.caption}>{caption}</p>}
    </div>
  );
}

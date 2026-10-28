import styles from "./HoursFyi.module.css";

// Hours are reference only. Never colored, never a bar, never a warning.
export function HoursFyi({ value, caption = "Suggested 5 h a day. Does not affect points." }: { value: string; caption?: string }) {
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.label}>Hours today</div>
        <div className={styles.caption}>{caption}</div>
      </div>
      <div className={styles.value}>{value}</div>
    </div>
  );
}

/** Office Presence mark: a presence dot inside a fence ring, with one pulse arc. */
export default function Mark({ size = 32, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Office Presence"
      className={`${animated ? "mark-animated" : ""} ${className ?? ""}`.trim()}
    >
      <circle className="mark-ring" cx="30" cy="34" r="20" fill="none" stroke="#FD5108" strokeWidth="5" />
      <circle className="mark-dot" cx="30" cy="34" r="8" fill="#FD5108" />
      <path
        className="mark-pulse"
        d="M44 8 A30 30 0 0 1 58 22"
        fill="none"
        stroke="#FD5108"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

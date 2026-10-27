import { ImageResponse } from "next/og";

/** Raster version of the mark for apple-touch and favicon.ico. */
export function markImage(size: number) {
  const ring = Math.round(size * 0.53);
  const stroke = Math.max(2, Math.round(size * 0.08));
  const dot = Math.round(size * 0.22);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "#1A1A1A",
          borderRadius: Math.round(size * 0.22),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: ring,
            height: ring,
            borderRadius: ring,
            border: `${stroke}px solid #FD5108`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: dot, height: dot, borderRadius: dot, background: "#FD5108" }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}

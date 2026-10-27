"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ViewAsBanner({
  sessionId,
  targetName,
  mode,
  expiresAt,
  adminName,
}: {
  sessionId: string;
  targetName: string;
  mode: "readonly" | "full";
  expiresAt: string;
  adminName: string;
}) {
  const router = useRouter();
  const [leftMin, setLeftMin] = useState(() => minutesLeft(expiresAt));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const key = `op-viewas-started-${sessionId}`;
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, String(Date.now()));
    const tick = () => {
      const m = minutesLeft(expiresAt);
      setLeftMin(m);
      if (m <= 0) void endSession(true);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, sessionId]);

  async function endSession(expired: boolean) {
    if (busy) return;
    setBusy(true);
    const started = Number(sessionStorage.getItem(`op-viewas-started-${sessionId}`) || "") || Date.now();
    const mins = Math.max(1, Math.round((Date.now() - started) / 60_000));
    await fetch("/api/admin/view-as/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch(() => null);
    const params = new URLSearchParams({
      ended: "1",
      as: targetName,
      mins: String(mins),
      you: adminName,
      ...(expired ? { reason: "expired" } : {}),
    });
    router.replace(`/admin/users?${params.toString()}`);
    router.refresh();
  }

  const modeLabel =
    mode === "full"
      ? `Test account, tracking on, ${leftMin} min left`
      : `Read only, ${leftMin} min left. Started from Users by ${adminName}.`;

  return (
    <div className="op-wimp" role="status">
      <span className="op-wimp-text">
        <b>Viewing as {targetName}</b> <span className="op-wimp-sub">{modeLabel}</span>
      </span>
      <button type="button" className="op-wimp-end" disabled={busy} onClick={() => void endSession(false)}>
        End
      </button>
    </div>
  );
}

function minutesLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 60_000));
}

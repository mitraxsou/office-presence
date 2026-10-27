export type TeamsPayload = {
  type: "login_otp" | "hours_started" | "hours_met" | "custom";
  email: string;
  name: string;
  message: string;
  otp?: string;
  otpExpiresMinutes?: number;
  hoursToday?: number;
  hoursTarget?: number;
  notifyTeams?: boolean;
  dashboardUrl?: string;
  settingsUrl?: string;
  helpUrl?: string;
};

export async function sendTeamsNotification(payload: TeamsPayload): Promise<boolean> {
  const url = process.env.POWER_AUTOMATE_WEBHOOK_URL;
  const secret = process.env.POWER_AUTOMATE_WEBHOOK_SECRET;
  if (!url || !secret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[notifications] webhook not configured; skipping send");
    }
    return false;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const body = {
    ...payload,
    notifyTeams: true,
    dashboardUrl: payload.dashboardUrl ?? `${base}/me`,
    settingsUrl: payload.settingsUrl ?? `${base}/admin/settings`,
    helpUrl: payload.helpUrl ?? `${base}/login`,
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Office-Pulse-Token": secret,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    console.error("[notifications] send failed", err);
    return false;
  }
}

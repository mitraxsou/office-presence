import { NextResponse } from "next/server";
import { verifyOtp, issueDeviceToken } from "@/lib/otp";
import { createSession } from "@/lib/auth";
import { clientIp, tooManyResponseInit } from "@/lib/rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let body: {
    email?: string;
    code?: string;
    client?: string;
    installId?: string;
    deviceName?: string;
    platform?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }
  const email = body.email?.trim();
  const code = body.code?.trim();
  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required" }, { status: 400, headers: NO_STORE });
  }
  const result = await verifyOtp(email, code, clientIp(request));
  if (!result.ok) {
    if (result.status === 429 && "retryAfterSeconds" in result) {
      const r = tooManyResponseInit(result.retryAfterSeconds, NO_STORE);
      return NextResponse.json(r.body, r.init);
    }
    return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  }
  const user = result.user;
  if (body.client === "android") {
    const { token, deviceId } = await issueDeviceToken(user.id, {
      installId: body.installId,
      label: body.deviceName,
      platform: body.platform ?? "android",
    });
    return NextResponse.json(
      {
        ok: true,
        token,
        deviceId,
        user: { id: user.id, email: user.email, role: user.role, name: user.name },
      },
      { headers: NO_STORE },
    );
  }
  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });
  return NextResponse.json(
    { ok: true, user: { id: user.id, email: user.email, role: user.role, name: user.name } },
    { headers: NO_STORE },
  );
}

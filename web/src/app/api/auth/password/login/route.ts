import { NextResponse } from "next/server";
import { recordApiActivity } from "@/lib/device-api-activity";
import { loginWithPassword } from "@/lib/password";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
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

  const result = await loginWithPassword(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  }

  if (result.kind === "device") {
    recordApiActivity({
      userId: result.user.id,
      deviceTokenId: result.deviceId,
      method: "POST",
      path: "/api/auth/password/login",
      statusCode: 200,
      note: "device",
      throttle: false,
    });
    return NextResponse.json(
      {
        ok: true,
        token: result.token,
        deviceId: result.deviceId,
        user: result.user,
      },
      { headers: NO_STORE },
    );
  }

  recordApiActivity({
    userId: result.user.id,
    method: "POST",
    path: "/api/auth/password/login",
    statusCode: 200,
    note: "web",
    throttle: false,
  });
  return NextResponse.json({ ok: true, user: result.user }, { headers: NO_STORE });
}

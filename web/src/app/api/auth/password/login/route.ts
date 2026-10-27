import { NextResponse } from "next/server";
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

  return NextResponse.json({ ok: true, user: result.user }, { headers: NO_STORE });
}

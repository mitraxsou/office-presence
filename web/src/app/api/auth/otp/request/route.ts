import { NextResponse } from "next/server";
import { requestOtp } from "@/lib/otp";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }
  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400, headers: NO_STORE });
  }
  const result = await requestOtp(email);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  }
  return NextResponse.json(
    {
      ok: true,
      sent: result.sent,
      message: "If this email can receive Teams messages, check Teams for your sign-in code.",
    },
    { headers: NO_STORE },
  );
}

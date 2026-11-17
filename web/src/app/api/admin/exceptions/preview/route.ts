import { NextResponse } from "next/server";
import { requireExceptionGranter } from "@/lib/actor";
import { previewException } from "@/lib/exceptions";

export async function GET(request: Request) {
  const actor = await requireExceptionGranter(request);
  if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "month" ? "month" : "days";
  const userId = url.searchParams.get("userId") ?? "";
  if (!userId) return NextResponse.json({ error: "Choose a person" }, { status: 400 });
  const result = await previewException({
    userId,
    kind,
    startDay: url.searchParams.get("startDay") ?? undefined,
    endDay: url.searchParams.get("endDay") ?? undefined,
    monthKey: url.searchParams.get("month") ?? undefined,
    officeLocationId: url.searchParams.get("office"),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ preview: result.preview });
}

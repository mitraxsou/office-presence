import { notFound } from "next/navigation";
import { FRAME_LIST, type FrameId } from "@/frames/fixtures";
import { FramePreview } from "@/frames/FramePreview";

export const dynamic = "force-dynamic";

export default async function FramePage({
  params,
}: {
  params: Promise<{ frame: string }>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_FRAME_PREVIEWS !== "1") {
    notFound();
  }
  const { frame } = await params;
  if (!(FRAME_LIST as readonly string[]).includes(frame)) notFound();
  return <FramePreview frame={frame as FrameId} />;
}

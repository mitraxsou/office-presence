import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPolicy, updatePolicy } from "@/lib/policy";
import { prisma } from "@/lib/db";
import { pushOutdatedAppUpdates, pushRulesChanged } from "@/lib/firebase-admin";

export async function GET() {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  return NextResponse.json({ policy: await getPolicy() });
}

export async function PATCH(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (res) {
    return res as Response;
  }
  const body = await request.json();
  const before = await getPolicy();
  const policy = await updatePolicy(body);
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "policy.update",
      targetType: "policy",
      targetId: "1",
      beforeJson: before,
      afterJson: policy,
    },
  });
  await pushRulesChanged();
  await pushOutdatedAppUpdates(policy.appVersionCode ?? 0);
  return NextResponse.json({ policy });
}

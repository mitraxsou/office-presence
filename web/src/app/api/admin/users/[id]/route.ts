import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRealAdminActor } from "@/lib/actor";
import { composeFullName, parseColleagueDisplayMode } from "@/lib/display-name";
import {
  clampName,
  isSelfGuardBlocked,
  validateAdminUserEmail,
  wouldRemoveLastAdmin,
} from "@/lib/users-admin";
import type { Role } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      colleagueDisplayMode: true,
      role: true,
      isDummy: true,
      isTestAccount: true,
      deactivatedAt: true,
      passwordHash: true,
      homeOfficeId: true,
      homeOffice: { select: { id: true, name: true } },
      sharePresenceWithPeers: true,
      createdAt: true,
      updatedAt: true,
      deviceTokens: {
        select: {
          id: true,
          label: true,
          platform: true,
          lastSeenAt: true,
          createdAt: true,
          revokedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      status: {
        select: {
          inOffice: true,
          sinceAt: true,
          officeName: true,
          officeLocationId: true,
          monthPoints: true,
          lastDeviceName: true,
          lastEvidenceAt: true,
        },
      },
      viewAsAsTarget: {
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true,
          mode: true,
          startedAt: true,
          endedAt: true,
          expiresAt: true,
          admin: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const phones = user.deviceTokens.filter((d) => !d.revokedAt);
  const lastSeenAt =
    phones.find((d) => d.lastSeenAt)?.lastSeenAt?.toISOString() ??
    user.status?.lastEvidenceAt?.toISOString() ??
    null;

  const { passwordHash, ...safe } = user;
  return NextResponse.json({
    user: {
      ...safe,
      hasPassword: !!passwordHash,
      phones,
      lastSeenAt,
      statusLabel: user.deactivatedAt ? "deactivated" : "active",
      viewAsSessions: user.viewAsAsTarget,
    },
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: {
    firstName?: string | null;
    lastName?: string | null;
    preferredName?: string | null;
    colleagueDisplayMode?: string;
    name?: string | null;
    role?: Role;
    homeOfficeId?: string | null;
    isDummy?: boolean;
    isTestAccount?: boolean;
    sharePresenceWithPeers?: boolean;
    sharePresenceConsentAt?: Date | null;
    deactivatedAt?: Date | null;
  } = {};

  if (body.firstName !== undefined) data.firstName = clampName(body.firstName, 40);
  if (body.lastName !== undefined) data.lastName = clampName(body.lastName, 40);
  if (body.preferredName !== undefined) data.preferredName = clampName(body.preferredName, 30);
  if (body.colleagueDisplayMode !== undefined) {
    data.colleagueDisplayMode = parseColleagueDisplayMode(body.colleagueDisplayMode);
  }
  if (body.name !== undefined) data.name = clampName(body.name, 120);

  if (
    data.firstName !== undefined ||
    data.lastName !== undefined ||
    (body.name === undefined && (body.firstName !== undefined || body.lastName !== undefined))
  ) {
    const first = data.firstName !== undefined ? data.firstName : target.firstName;
    const last = data.lastName !== undefined ? data.lastName : target.lastName;
    if (body.name === undefined) {
      data.name = composeFullName(first, last) ?? target.name;
    }
  }

  if (body.homeOfficeId !== undefined) {
    const homeOfficeId =
      body.homeOfficeId === null || body.homeOfficeId === "" ? null : String(body.homeOfficeId);
    if (homeOfficeId) {
      const office = await prisma.officeLocation.findUnique({ where: { id: homeOfficeId } });
      if (!office) return NextResponse.json({ error: "Home office not found" }, { status: 400 });
    }
    data.homeOfficeId = homeOfficeId;
  }

  if (body.isTestAccount !== undefined || body.isDummy !== undefined) {
    const flag = body.isTestAccount === true || body.isDummy === true;
    data.isTestAccount = flag;
    data.isDummy = flag;
  }

  if (body.sharePresenceWithPeers !== undefined) {
    data.sharePresenceWithPeers = !!body.sharePresenceWithPeers;
    data.sharePresenceConsentAt = data.sharePresenceWithPeers ? new Date() : null;
  }

  if (body.role !== undefined) {
    if (isSelfGuardBlocked(actor.user.id, id)) {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
    }
    const nextRole = (body.role === "admin" ? "admin" : "user") as Role;
    if (nextRole !== target.role) {
      const otherAdmins = await prisma.user.count({
        where: { role: "admin", deactivatedAt: null, id: { not: id } },
      });
      if (
        wouldRemoveLastAdmin({
          targetRole: target.role,
          nextRole,
          otherActiveAdminCount: otherAdmins,
        })
      ) {
        return NextResponse.json({ error: "Cannot demote the last admin" }, { status: 400 });
      }
      data.role = nextRole;
    }
  }

  if (body.email !== undefined) {
    const nextEmail = String(body.email).trim().toLowerCase();
    if (nextEmail !== target.email.toLowerCase()) {
      const allowTestDomain =
        target.isTestAccount ||
        target.isDummy ||
        body.isTestAccount === true ||
        body.isDummy === true;
      const emailCheck = validateAdminUserEmail(nextEmail, { allowTestDomain });
      if (!emailCheck.ok) {
        return NextResponse.json({ error: emailCheck.error }, { status: 400 });
      }
      const clash = await prisma.user.findUnique({ where: { email: emailCheck.email }, select: { id: true } });
      if (clash) return NextResponse.json({ error: "Email already exists", id: clash.id }, { status: 409 });
      await prisma.user.update({ where: { id }, data: { email: emailCheck.email } });
    }
  }

  if (body.reactivate === true) {
    data.deactivatedAt = null;
  }

  if (body.revokeDeviceId) {
    const deviceId = String(body.revokeDeviceId);
    await prisma.deviceToken.updateMany({
      where: { id: deviceId, userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actor.user.id,
        action: "device.revoke",
        targetType: "DeviceToken",
        targetId: deviceId,
        afterJson: { userId: id },
      },
    });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      colleagueDisplayMode: true,
      role: true,
      isDummy: true,
      isTestAccount: true,
      deactivatedAt: true,
      homeOfficeId: true,
      homeOffice: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const actor = await requireRealAdminActor(request);
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  if (isSelfGuardBlocked(actor.user.id, id)) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const confirmEmail = String(body.confirmEmail ?? body.confirm_email ?? "")
    .trim()
    .toLowerCase();
  if (!confirmEmail || confirmEmail !== target.email.toLowerCase()) {
    return NextResponse.json({ error: "confirmEmail must match the user email" }, { status: 400 });
  }

  if (target.role === "admin") {
    const otherAdmins = await prisma.user.count({
      where: { role: "admin", deactivatedAt: null, id: { not: id } },
    });
    if (
      wouldRemoveLastAdmin({
        targetRole: target.role,
        deleting: true,
        otherActiveAdminCount: otherAdmins,
      })
    ) {
      return NextResponse.json({ error: "Cannot delete the last admin" }, { status: 400 });
    }
  }

  // Push force_sign_out while FCM tokens still exist, then revoke and delete.
  const { sendForceSignOutToUser } = await import("@/lib/firebase-admin");
  await sendForceSignOutToUser(id, {
    reason: "deleted",
    message: "This account is no longer available. Sign in again.",
  });

  const now = new Date();
  // Revoke devices and end view-as before delete so mid-flight tokens fail immediately
  // (cascade also removes DeviceToken rows with the user).
  await prisma.$transaction([
    prisma.deviceToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.viewAsSession.updateMany({
      where: {
        endedAt: null,
        OR: [{ targetUserId: id }, { adminId: id }],
      },
      data: { endedAt: now },
    }),
    prisma.user.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        actorId: actor.user.id,
        action: "user.delete",
        targetType: "User",
        targetId: id,
        beforeJson: { email: target.email, role: target.role },
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}

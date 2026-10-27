import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveActor, unauthorized, rejectIfReadonlyViewAs } from "@/lib/actor";
import {
  composeFullName,
  displayName,
  greeting,
  parseColleagueDisplayMode,
} from "@/lib/display-name";
import { clampName } from "@/lib/users-admin";

export async function GET(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const u = actor.user;
  const profile = {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    preferredName: u.preferredName,
    colleagueDisplayMode: parseColleagueDisplayMode(u.colleagueDisplayMode),
    name: u.name,
    displayName: displayName(u),
    greeting: greeting(u, new Date(), u.timezone || "Asia/Kolkata"),
  };
  return NextResponse.json({
    profile,
    viewAs: actor.viewAs
      ? { sessionId: actor.viewAs.sessionId, mode: actor.viewAs.mode, adminId: actor.viewAs.adminId }
      : null,
  });
}

export async function PATCH(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return unauthorized();
  const blocked = rejectIfReadonlyViewAs(actor);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const firstName =
    body.firstName !== undefined ? clampName(body.firstName, 40) : undefined;
  const lastName = body.lastName !== undefined ? clampName(body.lastName, 40) : undefined;
  const preferredName =
    body.preferredName !== undefined ? clampName(body.preferredName, 30) : undefined;
  const colleagueDisplayMode =
    body.colleagueDisplayMode !== undefined
      ? parseColleagueDisplayMode(body.colleagueDisplayMode)
      : undefined;

  if (firstName !== undefined && !firstName) {
    return NextResponse.json({ error: "firstName is required" }, { status: 400 });
  }
  if (lastName !== undefined && !lastName) {
    return NextResponse.json({ error: "lastName is required" }, { status: 400 });
  }

  const nextFirst = firstName !== undefined ? firstName : actor.user.firstName;
  const nextLast = lastName !== undefined ? lastName : actor.user.lastName;

  const user = await prisma.user.update({
    where: { id: actor.user.id },
    data: {
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(preferredName !== undefined ? { preferredName } : {}),
      ...(colleagueDisplayMode !== undefined ? { colleagueDisplayMode } : {}),
      name: composeFullName(nextFirst, nextLast) ?? actor.user.name,
    },
  });

  return NextResponse.json({
    profile: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      preferredName: user.preferredName,
      colleagueDisplayMode: parseColleagueDisplayMode(user.colleagueDisplayMode),
      name: user.name,
      displayName: displayName(user),
      greeting: greeting(user, new Date(), user.timezone || "Asia/Kolkata"),
    },
  });
}

import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envGuard = vi.hoisted(() => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDirectUrl = process.env.DIRECT_URL;
  const unused =
    "postgresql://office_presence_test:office_presence_test@127.0.0.1:9/office_presence_test_unused";
  process.env.DATABASE_URL = unused;
  process.env.DIRECT_URL = unused;
  return { previousDatabaseUrl, previousDirectUrl };
});

const mocks = vi.hoisted(() => ({
  auditFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  deviceFindMany: vi.fn(),
  visitCreateMany: vi.fn(),
  visitFindMany: vi.fn(),
  userFindMany: vi.fn(),
  userCreate: vi.fn(),
  userUpdateMany: vi.fn(),
  officeFindMany: vi.fn(),
  recompute: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: { findFirst: mocks.auditFindFirst, create: mocks.auditCreate },
    deviceToken: { findMany: mocks.deviceFindMany },
    visit: { createMany: mocks.visitCreateMany, findMany: mocks.visitFindMany },
    user: { findMany: mocks.userFindMany, create: mocks.userCreate, updateMany: mocks.userUpdateMany },
    officeLocation: { findMany: mocks.officeFindMany },
  },
}));

vi.mock("@/lib/presence", () => ({
  recomputeUserPresence: mocks.recompute,
}));

import { GET, POST, maxDuration } from "../src/app/api/cron/office-tracker-sync/route";
import { dayKeyInTz } from "../src/lib/visit-calculator";

const TRACKER_URL = "https://office-tracker-theta.vercel.app/api/cron/presence-backfill";
const HEADER = "email,name,preferredName,timezone,role,dayKey,firstIn,lastOut,hours";

function csvRow(email: string, day: string) {
  return `${email},Person,,Asia/Kolkata,user,${day},${day}T03:30:00Z,${day}T10:00:00Z,6.5`;
}

function authed(method = "POST", search = "") {
  return new Request(`http://localhost/api/cron/office-tracker-sync${search}`, {
    method,
    headers: { authorization: "Bearer cron-secret" },
  });
}

function kolkataToday() {
  return dayKeyInTz(new Date(), "Asia/Kolkata");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.CRON_SECRET = "cron-secret";
  process.env.OFFICE_TRACKER_SYNC_SECRET = "tracker-secret";
  delete process.env.OFFICE_TRACKER_SYNC_URL;
  fetchMock = vi.fn().mockRejectedValue(new Error("fetch was not stubbed"));
  vi.stubGlobal("fetch", fetchMock);
  mocks.auditFindFirst.mockResolvedValue(null);
  mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  mocks.deviceFindMany.mockResolvedValue([]);
  mocks.officeFindMany.mockResolvedValue([{ id: "egl-1", name: "EGL", pointsPerVisitDay: 1 }]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.userCreate.mockImplementation(async ({ data }: { data: { email: string } }) => ({
    id: `user-${data.email}`,
  }));
  mocks.userUpdateMany.mockResolvedValue({ count: 0 });
  mocks.visitCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  mocks.recompute.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => {
  if (envGuard.previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = envGuard.previousDatabaseUrl;
  if (envGuard.previousDirectUrl === undefined) delete process.env.DIRECT_URL;
  else process.env.DIRECT_URL = envGuard.previousDirectUrl;
});

describe("office tracker sync cron", () => {
  it("exports a long max duration", () => {
    expect(maxDuration).toBe(300);
  });

  it("returns 401 when CRON_SECRET is missing or wrong", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(authed())).status).toBe(401);
    expect((await GET(authed("GET"))).status).toBe(401);

    process.env.CRON_SECRET = "";
    expect((await POST(authed())).status).toBe(401);

    process.env.CRON_SECRET = "cron-secret";
    const badBearer = new Request("http://localhost/api/cron/office-tracker-sync", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    expect((await POST(badBearer)).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/cron/office-tracker-sync?secret=wrong"))).status).toBe(401);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.auditFindFirst).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.visitCreateMany).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("returns the previous result and does not fetch again on the same Kolkata day", async () => {
    const today = kolkataToday();
    mocks.auditFindFirst.mockResolvedValue({
      afterJson: {
        dayKey: today,
        visitsInserted: 7,
        usersSkippedAppActive: 3,
        counts: { daysToInsert: 7, usersSkippedAppActive: 3 },
      },
    });

    const res = await POST(authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadySynced).toBe(true);
    expect(body.dayKey).toBe(today);
    expect(body.visitsInserted).toBe(7);
    expect(body.usersSkippedAppActive).toBe(3);
    expect(body.previous.visitsInserted).toBe(7);

    delete process.env.OFFICE_TRACKER_SYNC_SECRET;
    const again = await GET(new Request("http://localhost/api/cron/office-tracker-sync?secret=cron-secret"));
    expect(again.status).toBe(200);
    expect((await again.json()).alreadySynced).toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.deviceFindMany).not.toHaveBeenCalled();
    expect(mocks.visitCreateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("fetches again when force=1, and a previous day does not block today", async () => {
    const today = kolkataToday();
    mocks.auditFindFirst.mockResolvedValue({
      afterJson: { dayKey: today, visitsInserted: 1, usersSkippedAppActive: 0 },
    });
    fetchMock.mockResolvedValue(new Response("no", { status: 503 }));

    const forced = await POST(authed("POST", "?force=1"));
    expect(forced.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.visitCreateMany).not.toHaveBeenCalled();

    fetchMock.mockClear();
    mocks.auditFindFirst.mockResolvedValue({
      afterJson: { dayKey: "2000-01-01", visitsInserted: 1, usersSkippedAppActive: 0 },
    });
    const nextDay = await POST(authed());
    expect(nextDay.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("writes nothing when the tracker secret is missing or the fetch fails", async () => {
    delete process.env.OFFICE_TRACKER_SYNC_SECRET;
    const missing = await POST(authed());
    expect(missing.status).toBe(500);
    expect(await missing.json()).toEqual({ error: "OFFICE_TRACKER_SYNC_SECRET is not set" });
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.OFFICE_TRACKER_SYNC_SECRET = "tracker-secret";
    fetchMock.mockResolvedValue(new Response("denied", { status: 401 }));
    const denied = await POST(authed());
    expect(denied.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRejectedValue(new Error("network down"));
    const thrown = await GET(authed("GET"));
    expect(thrown.status).toBe(502);
    expect(await thrown.json()).toEqual({ error: "Could not reach Office Tracker" });

    fetchMock.mockResolvedValue(new Response("  ", { status: 200 }));
    const empty = await POST(authed());
    expect(empty.status).toBe(502);

    expect(mocks.deviceFindMany).not.toHaveBeenCalled();
    expect(mocks.visitCreateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("pulls the CSV with the tracker secret and skips only active app users", async () => {
    const csv = [
      HEADER,
      csvRow("active.app@pwc.com", "2020-01-06"),
      csvRow("active.app@pwc.com", "2020-01-07"),
      csvRow("other.person@pwc.com", "2020-01-06"),
    ].join("\n");
    fetchMock.mockResolvedValue(new Response(csv, { status: 200, headers: { "content-type": "text/csv" } }));
    mocks.deviceFindMany.mockResolvedValue([{ user: { email: "Active.App@pwc.com" } }]);

    const res = await POST(authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadySynced).toBe(false);
    expect(body.dayKey).toBe(kolkataToday());
    expect(body.applied.visitsInserted).toBe(1);
    expect(body.counts.usersSkippedAppActive).toBe(1);
    expect(body.counts.daysSkippedAppActive).toBe(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      TRACKER_URL,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer tracker-secret" },
      }),
    );
    expect(mocks.deviceFindMany).toHaveBeenCalledWith({
      where: { revokedAt: null, lastSeenAt: { not: null } },
      select: { user: { select: { email: true } } },
    });
    expect(mocks.userCreate).toHaveBeenCalledTimes(1);
    expect(mocks.userCreate.mock.calls[0][0].data.email).toBe("other.person@pwc.com");

    const inserted = mocks.visitCreateMany.mock.calls[0][0].data as Array<{
      userId: string;
      editedBy: string | null;
      reason: string;
      source: string;
    }>;
    expect(inserted).toEqual([
      expect.objectContaining({
        userId: "user-other.person@pwc.com",
        editedBy: null,
        source: "admin",
        reason: "office-tracker-backfill:2020-01-06",
      }),
    ]);
    expect(mocks.recompute).toHaveBeenCalledWith("user-other.person@pwc.com", { flushAlerts: false });

    const audit = mocks.auditCreate.mock.calls[0][0].data;
    expect(audit.actorId).toBeNull();
    expect(audit.action).toBe("import.office_tracker_sync");
    expect(audit.afterJson.dayKey).toBe(kolkataToday());
    expect(audit.afterJson.usersSkippedAppActive).toBe(1);
    expect(audit.afterJson.visitsInserted).toBe(1);
  });

  it("uses OFFICE_TRACKER_SYNC_URL when it is set", async () => {
    process.env.OFFICE_TRACKER_SYNC_URL = "https://tracker.example/api/cron/presence-backfill";
    fetchMock.mockResolvedValue(new Response("no", { status: 500 }));
    const res = await POST(authed());
    expect(res.status).toBe(502);
    expect(fetchMock.mock.calls[0][0]).toBe("https://tracker.example/api/cron/presence-backfill");
    expect(mocks.visitCreateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("the manual import route does not pass a skip list", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/app/api/admin/imports/office-tracker/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/skipEmails/);
    expect(src).toMatch(/adminId:\s*admin\.id/);
    expect(src).not.toMatch(/office_tracker_sync/);
  });
});

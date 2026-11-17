import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: null as unknown,
  created: [] as Record<string, unknown>[],
  rules: {} as Record<string, unknown>,
  userUpdate: vi.fn(),
  revoke: vi.fn(),
  audit: vi.fn(),
  signOut: vi.fn(async () => ({ sent: 1, skipped: false })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deviceToken: { update: vi.fn(), updateMany: mocks.revoke },
    presenceEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.created.push(data);
        return data;
      }),
      findMany: vi.fn(async () => []),
    },
    user: { update: mocks.userUpdate },
    auditLog: { create: mocks.audit },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/actor", () => ({
  resolveActor: vi.fn(async () => mocks.actor),
  rejectIfReadonlyViewAs: vi.fn(() => null),
  unauthorized: () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
}));
vi.mock("@/lib/device-api-activity", () => ({ recordApiActivity: vi.fn() }));
vi.mock("@/lib/otp", () => ({ cleanDeviceLabel: (s: string | null | undefined) => s?.trim() || null }));
vi.mock("@/lib/presence", () => {
  const status = {
    inOffice: false, sinceAt: null, officeLocationId: null, officeName: null, pointsToday: 0, monthPoints: 0,
    monthVisitDays: 0, pointsTarget: 8, pointsRemaining: 8, targetMet: false, hoursToday: 0, dayHoursAdvisory: 5, monthDays: [],
  };
  return { recomputeUserPresence: vi.fn(async () => status), touchStatusFromLatestEvidence: vi.fn(async () => status) };
});
vi.mock("@/lib/offices", () => ({
  listActiveOffices: vi.fn(async () => [{ id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 2 }]),
}));
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => mocks.rules) }));
vi.mock("@/lib/firebase-admin", () => ({ sendForceSignOutToUser: mocks.signOut }));

import { POST as ingest } from "../src/app/api/ingest/route";
import { DELETE as withdraw, GET as getConsent, POST as accept } from "../src/app/api/me/consent/route";
import { computeVisits, type PresenceEventInput } from "../src/lib/visit-calculator";
import { parseNotice } from "../src/lib/privacy-notice";

const baseRules = {
  gapMinutes: 15, dayHours: 5, monthlyDaysTarget: 8, monthlyPointsTarget: 8, timezone: "Asia/Kolkata",
  fenceRadiusMeters: 100, sampleIntervalMinutes: 5, privacyNoticeVersion: "2", requireConsent: false,
  rawLocationRetentionDays: 90,
};
const device = { id: "dev1", label: "Pixel" };

function send(events: unknown[]) {
  return ingest(new Request("http://localhost/api/ingest", { method: "POST", body: JSON.stringify({ events }) }));
}

beforeEach(() => {
  mocks.created.length = 0;
  mocks.rules = { ...baseRules };
  mocks.actor = { user: { id: "u1", privacyConsentVersion: null }, device };
  mocks.userUpdate.mockReset().mockImplementation(async ({ data }) => ({ id: "u1", ...data }));
  mocks.revoke.mockReset().mockResolvedValue({ count: 1 });
  mocks.audit.mockReset();
  mocks.signOut.mockClear();
});

describe("ingest stores less", () => {
  it("drops coordinates and Wi-Fi for a fix outside every office, keeps them inside", async () => {
    const now = Date.now();
    const res = await send([
      { type: "sample", at: new Date(now - 120_000).toISOString(), lat: 28.6, lng: 77.2, accuracyMeters: 12, wifiSsid: "Home", wifiBssid: "aa", clientEventId: "home" },
      { type: "sample", at: new Date(now - 60_000).toISOString(), lat: 22.57, lng: 88.36, accuracyMeters: 10, wifiSsid: "PwC", wifiBssid: "bb", clientEventId: "office" },
    ]);
    expect(res.status).toBe(200);
    const home = mocks.created.find((e) => e.clientEventId === "home")!;
    expect(home).toMatchObject({ latitude: null, longitude: null, wifiSsid: null, wifiBssid: null, accuracyMeters: 12 });
    const office = mocks.created.find((e) => e.clientEventId === "office")!;
    expect(office).toMatchObject({ latitude: 22.57, longitude: 88.36, wifiSsid: "PwC", officeLocationId: "kol" });
  });
});

describe("consent gate", () => {
  it("refuses events and stores nothing when consent is required and missing", async () => {
    mocks.rules = { ...baseRules, requireConsent: true };
    const res = await send([{ type: "exit", at: new Date().toISOString(), clientEventId: "x" }]);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "consent_required" });
    expect(mocks.created).toHaveLength(0);
  });

  it("refuses an outdated version and accepts the current one", async () => {
    mocks.rules = { ...baseRules, requireConsent: true };
    mocks.actor = { user: { id: "u1", privacyConsentVersion: "1" }, device };
    expect((await send([{ type: "exit", at: new Date().toISOString(), clientEventId: "a" }])).status).toBe(403);
    mocks.actor = { user: { id: "u1", privacyConsentVersion: "2" }, device };
    expect((await send([{ type: "exit", at: new Date().toISOString(), clientEventId: "b" }])).status).toBe(200);
  });

  it("does not gate while requireConsent is off", async () => {
    expect((await send([{ type: "exit", at: new Date().toISOString(), clientEventId: "c" }])).status).toBe(200);
  });
});

describe("/api/me/consent", () => {
  const req = (method: string, body?: unknown) =>
    new Request("http://localhost/api/me/consent", { method, body: body ? JSON.stringify(body) : undefined });

  it("GET reports the required and accepted versions", async () => {
    const j = await (await getConsent(req("GET"))).json();
    expect(j).toMatchObject({ requiredVersion: "2", acceptedVersion: null, accepted: false, required: false, noticeUrl: "/privacy" });
  });

  it("POST stores only the current version and audits it", async () => {
    expect((await accept(req("POST", { version: "1" }))).status).toBe(400);
    const res = await accept(req("POST", { version: "2" }));
    expect(res.status).toBe(200);
    expect(mocks.userUpdate.mock.calls[0][0].data.privacyConsentVersion).toBe("2");
    expect(mocks.audit.mock.calls[0][0].data.action).toBe("privacy.consent");
  });

  it("view-as cannot consent for someone else", async () => {
    mocks.actor = { user: { id: "u1" }, device: null, viewAs: { mode: "full" } };
    expect((await accept(req("POST", { version: "2" }))).status).toBe(403);
  });

  it("DELETE from a phone revokes that phone only", async () => {
    mocks.actor = { user: { id: "u1", privacyConsentVersion: "2" }, device };
    const res = await withdraw(req("DELETE"));
    expect(res.status).toBe(200);
    expect(mocks.revoke.mock.calls[0][0].where).toEqual({ id: "dev1", revokedAt: null });
    expect(mocks.userUpdate.mock.calls[0][0].data).toEqual({ privacyConsentVersion: null, privacyConsentAt: null });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.audit.mock.calls[0][0].data.action).toBe("privacy.withdraw");
  });

  it("DELETE from the website revokes every phone and pushes sign out", async () => {
    mocks.actor = { user: { id: "u1", privacyConsentVersion: "2" }, device: null };
    mocks.revoke.mockResolvedValue({ count: 2 });
    const j = await (await withdraw(req("DELETE"))).json();
    expect(mocks.revoke.mock.calls[0][0].where).toEqual({ userId: "u1", revokedAt: null });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(j.devicesRevoked).toBe(2);
  });
});

describe("recompute after coordinates are removed", () => {
  it("gives the same visits and points (office id and pointsAtMatch carry it)", () => {
    const kol = { id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 3 };
    const events: PresenceEventInput[] = [
      { type: "enter", at: "2026-08-10T04:00:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10, officeLocationId: "kol", pointsAtMatch: 2 },
      { type: "sample", at: "2026-08-10T04:10:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10, officeLocationId: "kol", pointsAtMatch: 2 },
      { type: "sample", at: "2026-08-10T04:20:00.000Z", accuracyMeters: 10 },
      { type: "exit", at: "2026-08-10T05:00:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10, officeLocationId: "kol" },
    ];
    const stripped = events.map((e) => ({ ...e, lat: null, lng: null }));
    const args = { rules: baseRules, offices: [kol], now: Date.parse("2026-11-17T06:00:00Z") };
    const before = computeVisits({ ...args, events });
    const after = computeVisits({ ...args, events: stripped });
    expect(before.visitDays).toBe(1);
    expect(after.totalPoints).toBe(before.totalPoints);
    expect(after.days).toEqual(before.days);
  });
});

describe("privacy notice", () => {
  it("parses headings, lists and the draft note", () => {
    const blocks = parseNotice("> DRAFT\n\n# Title\n\nIntro line\n\n## What we collect\n\n- One\n- Two\n");
    expect(blocks.map((b) => b.kind)).toEqual(["note", "h1", "p", "h2", "ul"]);
  });
});

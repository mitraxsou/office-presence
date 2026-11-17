import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: null as unknown,
  created: [] as Record<string, unknown>[],
  findMany: vi.fn(),
  recompute: vi.fn(),
  touch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    deviceToken: { update: vi.fn() },
    presenceEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.created.push(data);
        return data;
      }),
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/actor", () => ({
  resolveActor: vi.fn(async () => mocks.actor),
  rejectIfReadonlyViewAs: vi.fn(() => null),
  unauthorized: () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
}));

vi.mock("@/lib/device-api-activity", () => ({ recordApiActivity: vi.fn() }));
vi.mock("@/lib/otp", () => ({ cleanDeviceLabel: (s: string | null | undefined) => s?.trim() || null }));

const status = {
  inOffice: false,
  sinceAt: null,
  officeLocationId: null,
  officeName: null,
  pointsToday: 0,
  monthPoints: 0,
  monthVisitDays: 0,
  pointsTarget: 8,
  pointsRemaining: 8,
  targetMet: false,
  hoursToday: 0,
  dayHoursAdvisory: 5,
  monthDays: [],
};

vi.mock("@/lib/presence", () => ({
  recomputeUserPresence: mocks.recompute,
  touchStatusFromLatestEvidence: mocks.touch,
}));

const kol = { id: "kol", lat: 22.57, lng: 88.36, radiusMeters: 100, pointsPerVisitDay: 1 };
const rules = {
  gapMinutes: 15,
  dayHours: 5,
  monthlyDaysTarget: 8,
  monthlyPointsTarget: 8,
  timezone: "Asia/Kolkata",
  fenceRadiusMeters: 100,
  sampleIntervalMinutes: 5,
};

vi.mock("@/lib/offices", () => ({ listActiveOffices: vi.fn(async () => [kol]) }));
vi.mock("@/lib/policy", () => ({ getPolicy: vi.fn(async () => rules) }));

import { POST } from "../src/app/api/ingest/route";
import { decideTrust, type TrustContext } from "../src/lib/ingest-trust";
import { computeVisits, type PresenceEventInput } from "../src/lib/visit-calculator";

const device = { id: "dev1", label: "Pixel" };
const user = { id: "u1" };

function post(events: unknown[]) {
  return POST(
    new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
    }),
  );
}

function ctx(over: Partial<TrustContext> = {}): TrustContext {
  return {
    nowMs: Date.parse("2026-11-17T06:00:00Z"),
    fromDevice: true,
    offices: [kol],
    rules,
    checkOutTimes: new Set(),
    insideEvidence: [],
    ...over,
  };
}

/** Roughly 120 m north of the Kolkata office centre. */
const NEAR_LAT = 22.57 + 120 / 111_320;

beforeEach(() => {
  mocks.created.length = 0;
  mocks.findMany.mockReset().mockResolvedValue([]);
  mocks.recompute.mockReset().mockResolvedValue(status);
  mocks.touch.mockReset().mockResolvedValue(status);
  mocks.actor = { user, device };
});

describe("POST /api/ingest trust", () => {
  it("returns 403 for a plain web session", async () => {
    mocks.actor = { user, device: null };
    const res = await post([{ type: "check_in", at: new Date().toISOString() }]);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the phone app can send presence" });
    expect(mocks.created).toHaveLength(0);
  });

  it("allows a full view-as session", async () => {
    mocks.actor = { user, device: null, viewAs: { mode: "full", sessionId: "s", adminId: "a" } };
    const res = await post([{ type: "exit", at: new Date().toISOString(), clientEventId: "e1" }]);
    expect(res.status).toBe(200);
  });

  it("skips a future event and stores the rest of the batch with 200", async () => {
    const now = Date.now();
    const res = await post([
      { type: "sample", at: new Date(now + 10 * 60_000).toISOString(), lat: kol.lat, lng: kol.lng, accuracyMeters: 10, clientEventId: "f" },
      { type: "enter", at: new Date(now - 60_000).toISOString(), clientEventId: "n" },
      { type: "sample", at: new Date(now - 30_000).toISOString(), lat: kol.lat, lng: kol.lng, accuracyMeters: 10, clientEventId: "ok" },
    ]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rejected).toBe(2);
    expect(body.rejectedReasons).toEqual({ future: 1, no_location: 1 });
    expect(body.pointsTarget).toBe(8);
    expect(mocks.created.map((c) => c.clientEventId)).toEqual(["n", "ok"]);
    expect(mocks.created[0]).toMatchObject({ trusted: false, rejectReason: "no_location", officeLocationId: null });
    expect(mocks.created[1]).toMatchObject({ trusted: true, officeLocationId: "kol", pointsAtMatch: 1 });
  });

  it("client office id cannot override the server match", async () => {
    const other = "elsewhere";
    const res = await post([
      { type: "sample", at: new Date().toISOString(), lat: kol.lat, lng: kol.lng, accuracyMeters: 10, officeLocationId: other, clientEventId: "m" },
    ]);
    expect(res.status).toBe(200);
    expect(mocks.created[0]).toMatchObject({ trusted: true, officeLocationId: "kol", rejectReason: "client_office_mismatch" });
  });
});

describe("mock GPS", () => {
  const mockSample = () => ({
    type: "sample",
    at: new Date().toISOString(),
    lat: kol.lat,
    lng: kol.lng,
    accuracyMeters: 10,
    mock: true,
    clientEventId: `m-${Math.random()}`,
  });

  it("a mock event from a real account is stored untrusted", async () => {
    const res = await post([mockSample()]);
    const body = await res.json();
    expect(body.rejectedReasons).toEqual({ mock_location: 1 });
    expect(mocks.created[0]).toMatchObject({ mockLocation: true, trusted: false, rejectReason: "mock_location" });
  });

  it("a mock event from a test account counts", async () => {
    mocks.actor = { user: { ...user, isTestAccount: true }, device };
    await post([mockSample()]);
    expect(mocks.created[0]).toMatchObject({ mockLocation: true, trusted: true, officeLocationId: "kol" });
  });

  it("policy off makes it count but keeps the flag for the badge", async () => {
    const r = rules as typeof rules & { rejectMockLocations?: boolean };
    r.rejectMockLocations = false;
    try {
      await post([mockSample()]);
      expect(mocks.created[0]).toMatchObject({ mockLocation: true, trusted: true });
    } finally {
      delete r.rejectMockLocations;
    }
  });
});

describe("decideTrust", () => {
  const at = Date.parse("2026-11-17T05:00:00Z");

  it("stores events older than 30 days untrusted", () => {
    const d = decideTrust({ type: "sample", atMs: at - 31 * 24 * 3600_000, lat: kol.lat, lng: kol.lng, accuracyMeters: 10 }, ctx());
    expect(d).toMatchObject({ skip: false, trusted: false, rejectReason: "too_old" });
    const ok = decideTrust({ type: "sample", atMs: at - 20 * 24 * 3600_000, lat: kol.lat, lng: kol.lng, accuracyMeters: 10 }, ctx());
    expect(ok).toMatchObject({ trusted: true, officeLocationId: "kol" });
  });

  it("an enter far from every office is untrusted", () => {
    const d = decideTrust({ type: "enter", atMs: at, lat: 28.6, lng: 77.2, accuracyMeters: 10, officeLocationId: "kol" }, ctx());
    expect(d).toMatchObject({ trusted: false, rejectReason: "outside_office" });
    const noClaim = decideTrust({ type: "enter", atMs: at, lat: 28.6, lng: 77.2, accuracyMeters: 10 }, ctx());
    expect(noClaim).toMatchObject({ trusted: false, rejectReason: "outside_office" });
  });

  it("an enter with 150 m accuracy within radius plus accuracy is trusted", () => {
    const d = decideTrust({ type: "enter", atMs: at, lat: NEAR_LAT, lng: kol.lng, accuracyMeters: 150, officeLocationId: "kol" }, ctx());
    expect(d).toMatchObject({ trusted: true, officeLocationId: "kol", rejectReason: null });
  });

  it("the plausible fallback needs a device token", () => {
    const d = decideTrust(
      { type: "enter", atMs: at, lat: NEAR_LAT, lng: kol.lng, accuracyMeters: 150, officeLocationId: "kol" },
      ctx({ fromDevice: false }),
    );
    expect(d).toMatchObject({ trusted: false, rejectReason: "outside_office" });
  });

  it("a sample outside every office with no claim stays trusted as Out evidence", () => {
    const d = decideTrust({ type: "sample", atMs: at, lat: 28.6, lng: 77.2, accuracyMeters: 10 }, ctx());
    expect(d).toMatchObject({ trusted: true, officeLocationId: null, rejectReason: null });
  });

  it("check_in needs the midnight pair and inside evidence", () => {
    const midnight = Date.parse("2026-11-16T18:30:00Z");
    const lone = decideTrust({ type: "check_in", atMs: midnight, officeLocationId: "kol" }, ctx());
    expect(lone).toMatchObject({ trusted: false, rejectReason: "unverified_check_in" });
    const paired = decideTrust(
      { type: "check_in", atMs: midnight, officeLocationId: "kol" },
      ctx({
        checkOutTimes: new Set([midnight]),
        insideEvidence: [{ officeLocationId: "kol", atMs: midnight - 5 * 60_000 }],
      }),
    );
    expect(paired).toMatchObject({ trusted: true, officeLocationId: "kol" });
  });

  it("exit and check_out are always trusted", () => {
    expect(decideTrust({ type: "exit", atMs: at }, ctx())).toMatchObject({ trusted: true });
    expect(decideTrust({ type: "check_out", atMs: at }, ctx())).toMatchObject({ trusted: true });
  });
});

describe("recompute with trusted events only", () => {
  function trustedOnly(events: (PresenceEventInput & { atMs?: number })[], c: TrustContext) {
    const out: PresenceEventInput[] = [];
    for (const e of events) {
      const d = decideTrust({ ...e, atMs: Date.parse(e.at) }, c);
      if (d.skip || !d.trusted) continue;
      out.push({ ...e, officeLocationId: d.officeLocationId });
      if (d.officeLocationId && e.type !== "exit" && e.type !== "check_out") {
        c.insideEvidence.push({ officeLocationId: d.officeLocationId, atMs: Date.parse(e.at) });
      }
      if (e.type === "check_out") c.checkOutTimes.add(Date.parse(e.at));
    }
    return out;
  }

  it("a coordinate-less enter does not create a visit", () => {
    const events: PresenceEventInput[] = [
      { type: "enter", at: "2026-11-17T04:00:00.000Z", officeLocationId: "kol" },
      { type: "exit", at: "2026-11-17T05:00:00.000Z", officeLocationId: "kol" },
    ];
    const r = computeVisits({ rules, events: trustedOnly(events, ctx()), offices: [kol], now: Date.parse("2026-11-17T06:00:00Z") });
    expect(r.visitDays).toBe(0);
    expect(r.totalPoints).toBe(0);
  });

  it("a far-away enter does not create a visit, a 150 m fix near the fence does", () => {
    const far = trustedOnly(
      [{ type: "enter", at: "2026-11-17T04:00:00.000Z", lat: 28.6, lng: 77.2, accuracyMeters: 10, officeLocationId: "kol" }],
      ctx(),
    );
    expect(computeVisits({ rules, events: far, offices: [kol], now: Date.parse("2026-11-17T06:00:00Z") }).visitDays).toBe(0);

    const near = trustedOnly(
      [{ type: "enter", at: "2026-11-17T04:00:00.000Z", lat: NEAR_LAT, lng: kol.lng, accuracyMeters: 150, officeLocationId: "kol" }],
      ctx(),
    );
    expect(computeVisits({ rules, events: near, offices: [kol], now: Date.parse("2026-11-17T06:00:00Z") }).visitDays).toBe(1);
  });

  it("the midnight split pair still produces two days", () => {
    const events: PresenceEventInput[] = [
      { type: "sample", at: "2026-11-16T18:20:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10 },
      { type: "check_out", at: "2026-11-16T18:30:00.000Z", officeLocationId: "kol" },
      { type: "check_in", at: "2026-11-16T18:30:00.000Z", officeLocationId: "kol" },
      { type: "sample", at: "2026-11-16T18:40:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10 },
    ];
    const c = ctx({ nowMs: Date.parse("2026-11-16T19:00:00Z") });
    const kept = trustedOnly(events, c);
    expect(kept).toHaveLength(4);
    const r = computeVisits({ rules, events: kept, offices: [kol], now: Date.parse("2026-11-16T19:00:00Z") });
    expect(r.days.map((d) => d.dayKey)).toEqual(["2026-11-16", "2026-11-17"]);
  });

  it("old trusted data recomputes to the same result", () => {
    const events: PresenceEventInput[] = [
      { type: "enter", at: "2026-11-10T04:00:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10, officeLocationId: "kol" },
      { type: "sample", at: "2026-11-10T04:10:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10, officeLocationId: "kol" },
      { type: "exit", at: "2026-11-10T04:20:00.000Z", lat: kol.lat, lng: kol.lng, accuracyMeters: 10, officeLocationId: "kol" },
    ];
    const args = { rules, offices: [kol], now: Date.parse("2026-11-17T06:00:00Z") };
    const before = computeVisits({ ...args, events });
    const after = computeVisits({ ...args, events: trustedOnly(events, ctx()) });
    expect(after.totalPoints).toBe(before.totalPoints);
    expect(after.days).toEqual(before.days);
  });
});

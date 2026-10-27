import { describe, expect, it } from "vitest";
import { computeVisits, DEFAULT_RULES } from "../../src/lib/visit-calculator";

describe("BUG-002 simulated never counts", () => {
  it("ignores simulated enter/exit", () => {
    const result = computeVisits({
      rules: DEFAULT_RULES,
      events: [
        { type: "enter", at: "2026-10-27T04:00:00.000Z", lat: 12.97, lng: 77.59, accuracyMeters: 10, simulated: true },
        { type: "exit", at: "2026-10-27T12:00:00.000Z", lat: 12.97, lng: 77.59, accuracyMeters: 10, simulated: true },
      ],
      office: { lat: 12.97, lng: 77.59, radiusMeters: 100 },
    });
    expect(result.totalHours).toBe(0);
    expect(result.visits).toHaveLength(0);
  });
});

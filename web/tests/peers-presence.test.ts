import { describe, expect, it } from "vitest";
import { colleaguePresenceWhere, isTestOrDummyAccount } from "../src/lib/peers-presence";

describe("colleague presence test accounts", () => {
  it("treats either flag as a test or dummy account", () => {
    expect(isTestOrDummyAccount({ isTestAccount: true, isDummy: false })).toBe(true);
    expect(isTestOrDummyAccount({ isTestAccount: false, isDummy: true })).toBe(true);
    expect(isTestOrDummyAccount({ isTestAccount: true, isDummy: true })).toBe(true);
    expect(isTestOrDummyAccount({ isTestAccount: false, isDummy: false })).toBe(false);
  });

  it("hides test and dummy accounts from a non-admin, including a test account viewer", () => {
    const where = colleaguePresenceWhere({ id: "viewer-test", role: "user" });
    expect(where).toEqual({
      sharePresenceWithPeers: true,
      id: { not: "viewer-test" },
      deactivatedAt: null,
      isTestAccount: false,
      isDummy: false,
    });
  });

  it("keeps test and dummy accounts when the viewer is an admin", () => {
    const where = colleaguePresenceWhere({ id: "admin-1", role: "admin" });
    expect(where).toEqual({
      sharePresenceWithPeers: true,
      id: { not: "admin-1" },
      deactivatedAt: null,
    });
    expect(where).not.toHaveProperty("isTestAccount");
    expect(where).not.toHaveProperty("isDummy");
  });
});

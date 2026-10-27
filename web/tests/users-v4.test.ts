import { describe, expect, it } from "vitest";
import { isPwcEmail } from "../src/lib/email";
import { dayPartFor, displayName, greeting, greetingName } from "../src/lib/display-name";
import {
  isSelfGuardBlocked,
  validateAdminUserEmail,
  validatePwcUserEmail,
  wouldRemoveLastAdmin,
} from "../src/lib/users-admin";

describe("email must @pwc.com", () => {
  it("accepts pwc.com addresses", () => {
    expect(isPwcEmail("ada.lovelace@pwc.com")).toBe(true);
    expect(validatePwcUserEmail("Ada.Lovelace@PwC.com")).toEqual({
      ok: true,
      email: "ada.lovelace@pwc.com",
    });
  });

  it("rejects non-pwc domains", () => {
    expect(isPwcEmail("ada@example.com")).toBe(false);
    expect(validatePwcUserEmail("ada@example.com").ok).toBe(false);
    expect(validatePwcUserEmail("ada@pwc.co.uk").ok).toBe(false);
  });

  it("allows test domains for test accounts only", () => {
    expect(validateAdminUserEmail("dummy.in@example.pwc.local").ok).toBe(false);
    expect(
      validateAdminUserEmail("dummy.in@example.pwc.local", { allowTestDomain: true }),
    ).toEqual({ ok: true, email: "dummy.in@example.pwc.local" });
  });
});

describe("cannot demote last admin", () => {
  it("blocks demoting the sole active admin", () => {
    expect(
      wouldRemoveLastAdmin({
        targetRole: "admin",
        nextRole: "user",
        otherActiveAdminCount: 0,
      }),
    ).toBe(true);
  });

  it("allows demoting when another admin remains", () => {
    expect(
      wouldRemoveLastAdmin({
        targetRole: "admin",
        nextRole: "user",
        otherActiveAdminCount: 1,
      }),
    ).toBe(false);
  });

  it("blocks deactivating or deleting the last admin", () => {
    expect(
      wouldRemoveLastAdmin({
        targetRole: "admin",
        deactivating: true,
        otherActiveAdminCount: 0,
      }),
    ).toBe(true);
    expect(
      wouldRemoveLastAdmin({
        targetRole: "admin",
        deleting: true,
        otherActiveAdminCount: 0,
      }),
    ).toBe(true);
  });

  it("ignores non-admin targets", () => {
    expect(
      wouldRemoveLastAdmin({
        targetRole: "user",
        nextRole: "user",
        deactivating: true,
        otherActiveAdminCount: 0,
      }),
    ).toBe(false);
  });
});

describe("deactivate self blocked", () => {
  it("blocks self for role, deactivate, and delete guards", () => {
    expect(isSelfGuardBlocked("admin-1", "admin-1")).toBe(true);
    expect(isSelfGuardBlocked("admin-1", "user-2")).toBe(false);
  });
});

describe("displayName and greeting helpers", () => {
  const base = {
    firstName: "Ada",
    lastName: "Lovelace",
    preferredName: "Adi",
    email: "ada.lovelace@pwc.com",
  };

  it("formats colleague display modes", () => {
    expect(displayName({ ...base, colleagueDisplayMode: "first_last" })).toBe("Ada Lovelace");
    expect(displayName({ ...base, colleagueDisplayMode: "preferred_last" })).toBe("Adi Lovelace");
    expect(displayName({ ...base, colleagueDisplayMode: "preferred_only" })).toBe("Adi");
  });

  it("falls back when preferred is empty", () => {
    expect(
      displayName({
        firstName: "Ada",
        lastName: "Lovelace",
        preferredName: "",
        colleagueDisplayMode: "preferred_only",
      }),
    ).toBe("Ada");
    expect(greetingName({ firstName: "Ada", preferredName: null })).toBe("Ada");
    expect(greetingName({ preferredName: "Adi", firstName: "Ada" })).toBe("Adi");
  });

  it("picks morning afternoon evening in Asia/Kolkata", () => {
    // 05:30 UTC = 11:00 IST
    expect(dayPartFor(new Date("2026-10-27T05:30:00.000Z"))).toBe("morning");
    // 07:00 UTC = 12:30 IST
    expect(dayPartFor(new Date("2026-10-27T07:00:00.000Z"))).toBe("afternoon");
    // 12:00 UTC = 17:30 IST
    expect(dayPartFor(new Date("2026-10-27T12:00:00.000Z"))).toBe("evening");
  });

  it("builds greeting strings", () => {
    const morning = new Date("2026-10-27T05:30:00.000Z");
    expect(greeting(base, morning)).toBe("Good morning, Adi");
    const afternoon = new Date("2026-10-27T07:00:00.000Z");
    expect(greeting({ firstName: "Ada", preferredName: null }, afternoon)).toBe(
      "Good afternoon, Ada",
    );
  });
});

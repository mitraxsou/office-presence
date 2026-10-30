import { describe, expect, it } from "vitest";
import { isListedOffice } from "../src/lib/office-list";

describe("admin office list", () => {
  it("lists active and deactivated offices", () => {
    expect(isListedOffice({ status: "active", deletedAt: null })).toBe(true);
    expect(isListedOffice({ status: "inactive", deletedAt: null })).toBe(true);
  });

  it("hides deleted offices even when status is inactive", () => {
    expect(isListedOffice({ status: "inactive", deletedAt: "2026-10-30T00:00:00.000Z" })).toBe(false);
    expect(isListedOffice({ status: "active", deletedAt: "2026-10-30T00:00:00.000Z" })).toBe(false);
  });

  it("keeps suggestions and rejected offices out of the main list", () => {
    expect(isListedOffice({ status: "pending", deletedAt: null })).toBe(false);
    expect(isListedOffice({ status: "rejected", deletedAt: null })).toBe(false);
  });
});

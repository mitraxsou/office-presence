import { describe, expect, it } from "vitest";

describe("BUG-003 no prod db in tests", () => {
  it("DATABASE_URL is unset or clearly non-prod for tests", () => {
    const url = process.env.DATABASE_URL ?? "";
    expect(url).not.toMatch(/neon\.tech.*prod|office-tracker.*prod/i);
  });
});

import { describe, expect, it } from "vitest";
import {
  isLoginEmail,
  validatePasswordPlain,
  hashPassword,
  passwordsMatch,
} from "../src/lib/password";

describe("password validation", () => {
  it("accepts 8+ characters without spaces", () => {
    expect(validatePasswordPlain("secret12")).toEqual({ ok: true, password: "secret12" });
  });

  it("rejects short passwords", () => {
    expect(validatePasswordPlain("short")).toEqual({
      ok: false,
      error: "Password must be at least 8 characters",
    });
  });

  it("rejects passwords with spaces", () => {
    expect(validatePasswordPlain("bad pass1")).toEqual({
      ok: false,
      error: "Password cannot contain spaces",
    });
  });
});

describe("login email rules", () => {
  it("allows @pwc.com", () => {
    expect(isLoginEmail("ada.lovelace@pwc.com")).toBe(true);
  });

  it("allows test domain", () => {
    expect(isLoginEmail("dummy.in@example.pwc.local")).toBe(true);
  });

  it("rejects other domains", () => {
    expect(isLoginEmail("ada@example.com")).toBe(false);
  });
});

describe("password hashing", () => {
  it("hashes and verifies with bcrypt", async () => {
    const hash = await hashPassword("secret12");
    expect(hash).not.toContain("secret12");
    expect(await passwordsMatch("secret12", hash)).toBe(true);
    expect(await passwordsMatch("wrongpass", hash)).toBe(false);
  });
});

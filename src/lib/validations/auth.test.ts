import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth";

describe("loginSchema", () => {
  it("accepts a valid login payload", () => {
    expect(
      loginSchema.safeParse({
        tenant: "tenant-development",
        email: "owner@nextgen.local",
        password: "NextgenDev123!",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(loginSchema.safeParse({ tenant: "", email: "bad", password: "short" }).success).toBe(false);
  });
});

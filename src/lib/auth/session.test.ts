import { describe, expect, it } from "vitest";
import { hashSessionToken } from "./session";

describe("hashSessionToken", () => {
  it("returns a deterministic SHA-256 hash without retaining the token", () => {
    const token = "secret-session-token";
    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hash).toBe(hashSessionToken(token));
  });
});

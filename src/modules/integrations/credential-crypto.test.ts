import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential } from "./credential-crypto";

describe("integration credential encryption", () => {
  it("round-trips an authenticated payload and does not expose plaintext", () => {
    const key = randomBytes(32).toString("base64");
    const payload = { username: "operator", password: "highly-secret" };
    const envelope = encryptCredential(payload, key);
    expect(envelope).not.toContain(payload.password);
    expect(decryptCredential(envelope, key)).toEqual(payload);
  });

  it("rejects tampered ciphertext", () => {
    const key = randomBytes(32).toString("base64");
    const envelope = encryptCredential({ token: "secret" }, key);
    expect(() => decryptCredential(`${envelope.slice(0, -1)}x`, key)).toThrow();
  });
});

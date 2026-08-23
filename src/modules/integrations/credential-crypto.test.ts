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
    const parts = envelope.split(".");
    const tag = Buffer.from(parts[2]!, "base64url");
    tag[0] = (tag[0] ?? 0) ^ 0x01;
    parts[2] = tag.toString("base64url");

    expect(() => decryptCredential(parts.join("."), key)).toThrow();
  });

  it("rejects a valid envelope decrypted with the wrong key", () => {
    const key = randomBytes(32).toString("base64");
    const wrongKey = randomBytes(32).toString("base64");
    const envelope = encryptCredential({ token: "secret" }, key);

    expect(() => decryptCredential(envelope, wrongKey)).toThrow();
  });

  it.each(["", "v2.iv.tag.ciphertext", "v1.incomplete"])(
    "rejects malformed or empty envelope %j",
    (envelope) => {
      const key = randomBytes(32).toString("base64");
      expect(() => decryptCredential(envelope, key)).toThrow();
    },
  );
});

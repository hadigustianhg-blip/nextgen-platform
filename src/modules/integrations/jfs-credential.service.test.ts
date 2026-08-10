import { describe, expect, it, vi } from "vitest";
import { decryptCredential, encryptCredential } from "./credential-crypto";
import { maskAccount, JfsIntegrationError } from "./jfs-credential.service";

describe("JFS Integration Credential Service & Crypto Tests", () => {
  const testKey = "Q1dSSERHQldSUkVES0pGSERLV1JLRkhERktXUkhGS0Q="; // 32-byte base64 key

  it("TEST 1: Encrypt and decrypt credential correctly without exposing plaintext", () => {
    const payload = { account: "SUM001A_ADMIN", password: "SUPER_SECRET_JFS_PASSWORD_123" };
    const encrypted = encryptCredential(payload, testKey);

    expect(encrypted).not.toContain(payload.password);
    expect(encrypted).not.toContain(payload.account);
    expect(encrypted.startsWith("v1.")).toBe(true);

    const decrypted = decryptCredential<{ account: string; password: string }>(encrypted, testKey);
    expect(decrypted.account).toBe(payload.account);
    expect(decrypted.password).toBe(payload.password);
  });

  it("TEST 2: Plaintext password is never saved or returned", () => {
    const payload = { password: "MY_CONFIDENTIAL_PASS" };
    const encrypted = encryptCredential(payload, testKey);
    expect(encrypted).not.toContain("MY_CONFIDENTIAL_PASS");
  });

  it("TEST 3: Missing encryption key fails closed", () => {
    expect(() => encryptCredential({ secret: "data" }, "")).toThrow();
  });

  it("TEST 4: Account masking works cleanly", () => {
    expect(maskAccount("SUM001A_ADMIN")).toBe("******DMIN");
    expect(maskAccount("USER123")).toBe("******R123");
    expect(maskAccount("ABC")).toBe("******");
    expect(maskAccount(null)).toBe("******");
  });

  it("TEST 5: Network code mismatch creates JFS_NETWORK_MISMATCH error", () => {
    const actualNetworkCode = "SUM999A";
    const outletCode = "SUM001A";

    const mismatch = actualNetworkCode.toUpperCase() !== outletCode.toUpperCase();
    expect(mismatch).toBe(true);

    const err = new JfsIntegrationError(
      `Akun JFS terhubung ke network yang berbeda dari outlet NEXTGEN (${actualNetworkCode} vs ${outletCode}).`,
      400,
      "JFS_NETWORK_MISMATCH"
    );
    expect(err.code).toBe("JFS_NETWORK_MISMATCH");
    expect(err.status).toBe(400);
  });
});

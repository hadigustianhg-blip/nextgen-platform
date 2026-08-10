import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(overrideKey?: string): Buffer {
  const secretKey =
    overrideKey !== undefined
      ? overrideKey
      : process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY ||
        process.env.INTEGRATION_ENCRYPTION_KEY;

  if (!secretKey) {
    const error = new Error("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY is not configured");
    (error as unknown as { code: string }).code = "MISSING_ENCRYPTION_KEY";
    throw error;
  }

  // Try base64 decoding first if 32 bytes base64 encoded
  const b64Key = Buffer.from(secretKey, "base64");
  if (b64Key.length === 32) {
    return b64Key;
  }

  // Otherwise, deterministically derive a 32-byte key via SHA-256
  return createHash("sha256").update(secretKey, "utf8").digest();
}

export function encryptCredential(payload: Record<string, unknown>, overrideKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(overrideKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCredential<T = Record<string, unknown>>(envelope: string, overrideKey?: string): T {
  const [version, ivValue, tagValue, ciphertextValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    const error = new Error("Invalid credential envelope format");
    (error as unknown as { code: string }).code = "INVALID_CREDENTIAL_ENVELOPE";
    throw error;
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(overrideKey), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

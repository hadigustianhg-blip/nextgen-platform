import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(encodedKey = process.env.INTEGRATION_ENCRYPTION_KEY) {
  if (!encodedKey) throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptCredential(payload: Record<string, string>, encodedKey?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(encodedKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCredential(envelope: string, encodedKey?: string) {
  const [version, ivValue, tagValue, ciphertextValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid credential envelope");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(encodedKey), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
}

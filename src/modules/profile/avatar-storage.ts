import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const DEFAULT_AVATAR_URL = "/avatars/default-user.svg";

type AvatarStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

function readAvatarStorageConfig(): AvatarStorageConfig | null {
  const config = {
    endpoint: process.env.AVATAR_STORAGE_ENDPOINT?.trim() ?? "",
    region: process.env.AVATAR_STORAGE_REGION?.trim() ?? "",
    bucket: process.env.AVATAR_STORAGE_BUCKET?.trim() ?? "",
    accessKeyId: process.env.AVATAR_STORAGE_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: process.env.AVATAR_STORAGE_SECRET_ACCESS_KEY?.trim() ?? "",
    publicBaseUrl: process.env.AVATAR_STORAGE_PUBLIC_BASE_URL?.trim() ?? "",
  };
  if (!Object.values(config).every(Boolean)) return null;
  try {
    const endpoint = new URL(config.endpoint);
    const publicBaseUrl = new URL(config.publicBaseUrl);
    if (!["http:", "https:"].includes(endpoint.protocol) || publicBaseUrl.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return config;
}

export function isAvatarStorageConfigured() {
  return readAvatarStorageConfig() !== null;
}

export const isSharedImageStorageConfigured = isAvatarStorageConfigured;

export function resolveAvatarUrl(storageKey: string | null | undefined) {
  const config = readAvatarStorageConfig();
  if (!storageKey || !config) return DEFAULT_AVATAR_URL;
  const baseUrl = config.publicBaseUrl.endsWith("/") ? config.publicBaseUrl : `${config.publicBaseUrl}/`;
  return new URL(storageKey.split("/").map(encodeURIComponent).join("/"), baseUrl).toString();
}

export function resolveStoredImageUrl(storageKey: string | null | undefined) {
  const config = readAvatarStorageConfig();
  if (!storageKey || !config) return null;
  const baseUrl = config.publicBaseUrl.endsWith("/") ? config.publicBaseUrl : `${config.publicBaseUrl}/`;
  return new URL(storageKey.split("/").map(encodeURIComponent).join("/"), baseUrl).toString();
}

function storageClient(config: AvatarStorageConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function requireAvatarStorageConfig() {
  const config = readAvatarStorageConfig();
  if (!config) throw new Error("AVATAR_STORAGE_NOT_CONFIGURED");
  return config;
}

export async function putAvatar(storageKey: string, body: Uint8Array) {
  return putStoredImage(storageKey, body);
}

export async function putStoredImage(storageKey: string, body: Uint8Array) {
  const config = requireAvatarStorageConfig();
  await storageClient(config).send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    Body: body,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

export async function deleteAvatar(storageKey: string) {
  return deleteStoredImage(storageKey);
}

export async function deleteStoredImage(storageKey: string) {
  const config = requireAvatarStorageConfig();
  await storageClient(config).send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
  }));
}

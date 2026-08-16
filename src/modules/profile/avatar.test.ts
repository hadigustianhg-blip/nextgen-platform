import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    prisma: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import type { SessionContext } from "@/lib/auth/session";
import { MAX_AVATAR_BYTES, normalizeAvatarImage } from "./avatar-image";
import { DEFAULT_AVATAR_URL, isAvatarStorageConfigured, resolveAvatarUrl } from "./avatar-storage";
import { ProfileError } from "./profile.error";
import { updateOwnAvatar } from "./profile.service";

const session: SessionContext = {
  sessionId: "session-id",
  tenantId: "tenant-id",
  tenantName: "Tenant",
  userId: "user-id",
  userName: "Owner",
  email: "owner@example.test",
  outletId: "outlet-id",
  outletCode: "DEV001",
  roles: ["OWNER"],
};

const profileRecord = {
  id: "user-id",
  name: "Owner",
  email: "owner@example.test",
  status: "ACTIVE",
  lastLoginAt: null,
  avatarStorageKey: "avatars/tenant-id/user-id/new.webp",
  avatarUpdatedAt: new Date("2026-08-16T00:00:00.000Z"),
  tenant: { name: "Tenant" },
  outlet: { id: "outlet-id", code: "DEV001", name: "Development" },
  roles: [{ role: { code: "OWNER", name: "Owner" } }],
};

describe("avatar image validation", () => {
  it("normalizes a valid image to a static 512px WebP", async () => {
    const input = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2563eb" } }).png().toBuffer();
    const output = await normalizeAvatarImage(new File([Uint8Array.from(input)], "ignored.png", { type: "image/png" }));
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(metadata.pages ?? 1).toBe(1);
  });

  it("rejects invalid MIME, SVG, oversized, and animated images", async () => {
    await expect(normalizeAvatarImage(new File(["not-image"], "x.txt", { type: "text/plain" })))
      .rejects.toMatchObject({ code: "AVATAR_TYPE_INVALID" });
    await expect(normalizeAvatarImage(new File(["<svg/ >"], "x.svg", { type: "image/svg+xml" })))
      .rejects.toMatchObject({ code: "AVATAR_TYPE_INVALID" });
    await expect(normalizeAvatarImage(new File(["not-a-png"], "x.png", { type: "image/png" })))
      .rejects.toMatchObject({ code: "AVATAR_IMAGE_INVALID" });
    await expect(normalizeAvatarImage(new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "x.png", { type: "image/png" })))
      .rejects.toMatchObject({ code: "AVATAR_SIZE_INVALID" });
    const frameOne = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer();
    const frameTwo = await sharp({ create: { width: 8, height: 8, channels: 4, background: "blue" } }).png().toBuffer();
    const animated = await sharp([frameOne, frameTwo], { join: { animated: true } })
      .webp({ loop: 0, delay: [100, 100] }).toBuffer();
    await expect(normalizeAvatarImage(new File([Uint8Array.from(animated)], "x.webp", { type: "image/webp" })))
      .rejects.toMatchObject({ code: "AVATAR_ANIMATED_NOT_ALLOWED" });
  });

  it("rejects decoded dimensions above 4096 pixels", async () => {
    const oversizedDimensions = await sharp({ create: { width: 4097, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizeAvatarImage(new File([Uint8Array.from(oversizedDimensions)], "wide.png", { type: "image/png" })))
      .rejects.toMatchObject({ code: "AVATAR_DIMENSIONS_INVALID" });
  });
});

describe("avatar storage resolution", () => {
  const envKeys = [
    "AVATAR_STORAGE_ENDPOINT", "AVATAR_STORAGE_REGION", "AVATAR_STORAGE_BUCKET",
    "AVATAR_STORAGE_ACCESS_KEY_ID", "AVATAR_STORAGE_SECRET_ACCESS_KEY", "AVATAR_STORAGE_PUBLIC_BASE_URL",
  ] as const;

  beforeEach(() => {
    Object.assign(process.env, {
      AVATAR_STORAGE_ENDPOINT: "https://storage.example.test",
      AVATAR_STORAGE_REGION: "auto",
      AVATAR_STORAGE_BUCKET: "avatars",
      AVATAR_STORAGE_ACCESS_KEY_ID: "test-key",
      AVATAR_STORAGE_SECRET_ACCESS_KEY: "test-secret",
      AVATAR_STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test/base/",
    });
  });
  afterEach(() => envKeys.forEach((key) => delete process.env[key]));

  it("fails closed to the fallback when configuration or key is absent", () => {
    expect(resolveAvatarUrl(null)).toBe(DEFAULT_AVATAR_URL);
    delete process.env.AVATAR_STORAGE_BUCKET;
    expect(isAvatarStorageConfigured()).toBe(false);
    expect(resolveAvatarUrl("avatars/t/u/id.webp")).toBe(DEFAULT_AVATAR_URL);
  });

  it("resolves a key against the configured public base URL", () => {
    expect(resolveAvatarUrl("avatars/tenant/user/id.webp"))
      .toBe("https://cdn.example.test/base/avatars/tenant/user/id.webp");
  });
});

describe("own avatar update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.user.findFirst.mockResolvedValue({ id: "user-id", avatarStorageKey: "avatars/tenant-id/user-id/old.webp" });
    mocks.tx.user.update.mockResolvedValue(profileRecord);
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("uses session scope and deletes the old object only after DB success", async () => {
    const order: string[] = [];
    const dependencies = {
      normalize: vi.fn(async () => Buffer.from("webp")),
      put: vi.fn(async (_key: string, _body: Uint8Array) => { order.push("put"); }),
      remove: vi.fn(async (key: string) => { order.push(`remove:${key.includes("old.webp") ? "old" : "new"}`); }),
    };
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      order.push("db");
      return callback(mocks.tx);
    });

    await updateOwnAvatar(session, new File(["image"], "ignored.jpg", { type: "image/jpeg" }), dependencies);

    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-id", tenantId: "tenant-id", outletId: "outlet-id" },
    }));
    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-id" } }));
    expect(dependencies.put.mock.calls[0]?.[0]).toMatch(/^avatars\/tenant-id\/user-id\/[0-9a-f-]+\.webp$/);
    expect(order).toEqual(["put", "db", "remove:old"]);
  });

  it("cleans up the new object best-effort when the database update fails", async () => {
    const dependencies = {
      normalize: vi.fn(async () => Buffer.from("webp")),
      put: vi.fn(async (_key: string, _body: Uint8Array) => undefined),
      remove: vi.fn(async () => undefined),
    };
    mocks.prisma.$transaction.mockRejectedValueOnce(new ProfileError("DB_FAILED", 500));
    await expect(updateOwnAvatar(session, new File(["image"], "x.jpg", { type: "image/jpeg" }), dependencies))
      .rejects.toMatchObject({ code: "DB_FAILED" });
    expect(dependencies.remove).toHaveBeenCalledWith(dependencies.put.mock.calls[0]?.[0]);
  });
});

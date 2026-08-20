import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
  masterFindFirst: vi.fn(),
}));
vi.mock("./pickup-payment.service", () => ({
  createPickupPayment: mocks.create,
  updatePickupPayment: mocks.update,
  isCashPickupSettlement: (value: string | null | undefined) => value?.trim().toUpperCase() === "TUNAI",
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    pickupPayment: { findFirst: mocks.findFirst },
    masterPickup: { findFirst: mocks.masterFindFirst },
  },
}));

import {
  MAX_PICKUP_TRANSFER_PROOF_BYTES,
  createPickupPaymentWithProof,
  normalizePickupTransferProof,
  resolvePickupTransferProofUrl,
  updatePickupPaymentWithProof,
} from "./pickup-transfer-proof";

const context = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  outletId: "10000000-0000-4000-8000-000000000002",
  actorId: "10000000-0000-4000-8000-000000000003",
};
const baseInput = {
  requestKey: "20000000-0000-4000-8000-000000000001",
  masterPickupId: "30000000-0000-4000-8000-000000000001",
  paymentDate: "2026-08-20",
  method: "TRANSFER" as const,
  amount: "100000",
  bank: "BCA",
};
const pngFile = async (width = 800, height = 400) => {
  const buffer = await sharp({ create: { width, height, channels: 3, background: "white" } }).png().toBuffer();
  return new File([new Uint8Array(buffer)], "proof.png", { type: "image/png" });
};
const dependencies = () => ({
  configured: vi.fn<() => boolean>(() => true),
  normalize: vi.fn<(file: File) => Promise<Buffer>>(async () => Buffer.from("webp")),
  put: vi.fn<(key: string, body: Uint8Array) => Promise<void>>(async () => undefined),
  remove: vi.fn<(key: string) => Promise<void>>(async () => undefined),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockImplementation(async (_context, input) => ({ id: input.paymentId, ...input }));
  mocks.update.mockImplementation(async (_context, _id, input) => ({ id: input.paymentId, ...input }));
  mocks.masterFindFirst.mockResolvedValue({ rawPickup: { settlementRaw: "Tunai" } });
});

describe("pickup transfer proof image", () => {
  it("keeps the complete rectangular proof and emits static WebP", async () => {
    const output = await normalizePickupTransferProof(await pngFile(2400, 1200));
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 1600, height: 800 });
    expect(metadata.pages ?? 1).toBe(1);
  });

  it("rejects oversized, SVG, and corrupt images", async () => {
    await expect(normalizePickupTransferProof(new File(
      [new Uint8Array(MAX_PICKUP_TRANSFER_PROOF_BYTES + 1)], "large.jpg", { type: "image/jpeg" },
    ))).rejects.toThrow("TRANSFER_PROOF_SIZE_INVALID");
    await expect(normalizePickupTransferProof(new File(["<svg/>"] , "proof.svg", { type: "image/svg+xml" })))
      .rejects.toThrow("TRANSFER_PROOF_TYPE_INVALID");
    await expect(normalizePickupTransferProof(new File(["not-an-image"], "proof.png", { type: "image/png" })))
      .rejects.toThrow("TRANSFER_PROOF_IMAGE_INVALID");
  });
});

describe("pickup transfer proof lifecycle", () => {
  it("keeps Cash unchanged without storage", async () => {
    const deps = dependencies();
    deps.configured.mockReturnValue(false);
    await createPickupPaymentWithProof(context, { ...baseInput, method: "CASH" }, null, deps);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(deps.put).not.toHaveBeenCalled();
  });

  it("requires proof for Transfer and fails closed when storage is unavailable", async () => {
    await expect(createPickupPaymentWithProof(context, baseInput, null, dependencies()))
      .rejects.toThrow("TRANSFER_PROOF_REQUIRED");
    const deps = dependencies();
    deps.configured.mockReturnValue(false);
    await expect(createPickupPaymentWithProof(context, baseInput, await pngFile(), deps))
      .rejects.toThrow("TRANSFER_PROOF_STORAGE_NOT_CONFIGURED");
    expect(deps.put).not.toHaveBeenCalled();
  });

  it("uploads a scoped server-generated key and persists it with the payment", async () => {
    const deps = dependencies();
    const result = await createPickupPaymentWithProof(context, baseInput, await pngFile(), deps);
    const key = deps.put.mock.calls[0]?.[0];
    expect(key).toMatch(new RegExp(`^pickup-transfer/${context.tenantId}/${context.outletId}/[0-9a-f-]+/[0-9a-f-]+\\.webp$`));
    expect(result?.transferProofStorageKey).toBe(key);
    expect(mocks.masterFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: baseInput.masterPickupId, tenantId: context.tenantId, outletId: context.outletId },
    }));
  });

  it("rejects a cross-scope pickup before upload", async () => {
    const deps = dependencies();
    mocks.masterFindFirst.mockResolvedValueOnce(null);
    await expect(createPickupPaymentWithProof(context, baseInput, await pngFile(), deps)).resolves.toBeNull();
    expect(deps.put).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("cleans the new object if the database transaction fails", async () => {
    const deps = dependencies();
    mocks.create.mockRejectedValueOnce(new Error("DB_FAILED"));
    await expect(createPickupPaymentWithProof(context, baseInput, await pngFile(), deps)).rejects.toThrow("DB_FAILED");
    expect(deps.remove).toHaveBeenCalledWith(deps.put.mock.calls[0]?.[0]);
  });

  it("replaces old proof only after a scoped update succeeds", async () => {
    const deps = dependencies();
    const oldKey = `pickup-transfer/${context.tenantId}/${context.outletId}/old/proof.webp`;
    mocks.findFirst.mockResolvedValueOnce({ id: "payment-id", transferProofStorageKey: oldKey });
    await updatePickupPaymentWithProof(context, "payment-id", {
      requestKey: baseInput.requestKey, paymentDate: baseInput.paymentDate, method: "TRANSFER",
      amount: baseInput.amount, bank: baseInput.bank,
    }, await pngFile(), deps);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "payment-id", tenantId: context.tenantId, outletId: context.outletId }),
    }));
    expect(deps.remove).toHaveBeenCalledWith(oldKey);
    expect(deps.remove.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it("rejects a payment outside the session scope before upload", async () => {
    const deps = dependencies();
    mocks.findFirst.mockResolvedValueOnce(null);
    await expect(updatePickupPaymentWithProof(context, "other-tenant-payment", {
      requestKey: baseInput.requestKey, paymentDate: baseInput.paymentDate, method: "TRANSFER",
      amount: baseInput.amount, bank: baseInput.bank,
    }, await pngFile(), deps)).resolves.toBeNull();
    expect(deps.put).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("resolves only pickup-transfer history keys", () => {
    const previous = { ...process.env };
    Object.assign(process.env, {
      AVATAR_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      AVATAR_STORAGE_REGION: "auto",
      AVATAR_STORAGE_BUCKET: "bucket",
      AVATAR_STORAGE_ACCESS_KEY_ID: "test",
      AVATAR_STORAGE_SECRET_ACCESS_KEY: "test",
      AVATAR_STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test",
    });
    expect(resolvePickupTransferProofUrl("pickup-transfer/t/o/p/proof.webp"))
      .toBe("https://cdn.example.test/pickup-transfer/t/o/p/proof.webp");
    expect(resolvePickupTransferProofUrl("avatars/t/u/proof.webp")).toBeNull();
    process.env = previous;
  });
});

import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import {
  deleteStoredImage,
  isSharedImageStorageConfigured,
  putStoredImage,
  resolveStoredImageUrl,
} from "@/modules/profile/avatar-storage";
import { createPickupPayment, isCashPickupSettlement, updatePickupPayment } from "./pickup-payment.service";

export const MAX_PICKUP_TRANSFER_PROOF_BYTES = 5 * 1024 * 1024;
export const MAX_PICKUP_TRANSFER_PROOF_DIMENSION = 4096;
export const PICKUP_TRANSFER_PROOF_OUTPUT_SIZE = 1600;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedFormats = new Set(["jpeg", "png", "webp"]);

export async function normalizePickupTransferProof(file: File) {
  if (!allowedMimeTypes.has(file.type)) throw new Error("TRANSFER_PROOF_TYPE_INVALID");
  if (file.size <= 0 || file.size > MAX_PICKUP_TRANSFER_PROOF_BYTES) throw new Error("TRANSFER_PROOF_SIZE_INVALID");
  const input = new Uint8Array(await file.arrayBuffer());
  try {
    const metadata = await sharp(input, {
      animated: true,
      failOn: "warning",
      limitInputPixels: MAX_PICKUP_TRANSFER_PROOF_DIMENSION ** 2,
    }).metadata();
    if (!metadata.format || !allowedFormats.has(metadata.format)) throw new Error("TRANSFER_PROOF_TYPE_INVALID");
    if ((metadata.pages ?? 1) > 1) throw new Error("TRANSFER_PROOF_ANIMATED_NOT_ALLOWED");
    if (!metadata.width || !metadata.height || metadata.width > MAX_PICKUP_TRANSFER_PROOF_DIMENSION || metadata.height > MAX_PICKUP_TRANSFER_PROOF_DIMENSION) {
      throw new Error("TRANSFER_PROOF_DIMENSIONS_INVALID");
    }
    return await sharp(input, { failOn: "warning" })
      .rotate()
      .resize(PICKUP_TRANSFER_PROOF_OUTPUT_SIZE, PICKUP_TRANSFER_PROOF_OUTPUT_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 88 })
      .toBuffer();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TRANSFER_PROOF_")) throw error;
    throw new Error("TRANSFER_PROOF_IMAGE_INVALID");
  }
}

export function resolvePickupTransferProofUrl(storageKey: string | null | undefined) {
  if (!storageKey?.startsWith("pickup-transfer/")) return null;
  return resolveStoredImageUrl(storageKey);
}

type Context = { tenantId: string; outletId: string; actorId: string };
type PaymentInput = {
  requestKey: string; masterPickupId: string; paymentDate: string; method: "CASH" | "TRANSFER";
  amount: string | number; reference?: string; bank?: string; note?: string; confirmOverpayment?: boolean;
};
type UpdateInput = Omit<PaymentInput, "masterPickupId">;
type Dependencies = {
  configured: () => boolean;
  normalize: typeof normalizePickupTransferProof;
  put: typeof putStoredImage;
  remove: typeof deleteStoredImage;
};
const defaultDependencies: Dependencies = {
  configured: isSharedImageStorageConfigured,
  normalize: normalizePickupTransferProof,
  put: putStoredImage,
  remove: deleteStoredImage,
};

function proofKey(context: Context, paymentId: string) {
  return `pickup-transfer/${context.tenantId}/${context.outletId}/${paymentId}/${randomUUID()}.webp`;
}

async function removeBestEffort(remove: Dependencies["remove"], storageKey: string, marker: string) {
  await remove(storageKey).catch((error: unknown) => {
    console.error(marker, { errorName: error instanceof Error ? error.name : "UnknownError" });
  });
}

export async function createPickupPaymentWithProof(
  context: Context,
  input: PaymentInput,
  proof: File | null,
  dependencies: Dependencies = defaultDependencies,
) {
  if (input.method === "CASH") return createPickupPayment(context, input);
  if (!proof) throw new Error("TRANSFER_PROOF_REQUIRED");
  if (!dependencies.configured()) throw new Error("TRANSFER_PROOF_STORAGE_NOT_CONFIGURED");
  const masterPickup = await prisma.masterPickup.findFirst({
    where: { id: input.masterPickupId, tenantId: context.tenantId, outletId: context.outletId },
    select: { rawPickup: { select: { settlementRaw: true } } },
  });
  if (!masterPickup) return null;
  if (!isCashPickupSettlement(masterPickup.rawPickup.settlementRaw)) throw new Error("PICKUP_PAYMENT_NOT_CASH_SETTLEMENT");
  const paymentId = randomUUID();
  const storageKey = proofKey(context, paymentId);
  const body = await dependencies.normalize(proof);
  await dependencies.put(storageKey, body);
  try {
    const payment = await createPickupPayment(context, {
      ...input, paymentId, transferProofStorageKey: storageKey,
    });
    if (!payment || payment.id !== paymentId) await removeBestEffort(dependencies.remove, storageKey, "[PICKUP_TRANSFER_PROOF_REPLAY_CLEANUP]");
    return payment;
  } catch (error) {
    await removeBestEffort(dependencies.remove, storageKey, "[PICKUP_TRANSFER_PROOF_ROLLBACK_CLEANUP]");
    throw error;
  }
}

export async function updatePickupPaymentWithProof(
  context: Context,
  id: string,
  input: UpdateInput,
  proof: File | null,
  dependencies: Dependencies = defaultDependencies,
) {
  const current = await prisma.pickupPayment.findFirst({
    where: { id, tenantId: context.tenantId, outletId: context.outletId, recordStatus: "VALID" },
    select: { id: true, transferProofStorageKey: true },
  });
  if (!current) return null;
  if (input.method === "TRANSFER" && !proof && !current.transferProofStorageKey) throw new Error("TRANSFER_PROOF_REQUIRED");
  if (input.method === "TRANSFER" && proof && !dependencies.configured()) throw new Error("TRANSFER_PROOF_STORAGE_NOT_CONFIGURED");

  const paymentId = randomUUID();
  const storageKey = input.method === "TRANSFER"
    ? proof ? proofKey(context, paymentId) : current.transferProofStorageKey
    : null;
  if (proof && storageKey) {
    const body = await dependencies.normalize(proof);
    await dependencies.put(storageKey, body);
  }
  try {
    const payment = await updatePickupPayment(context, id, {
      ...input, paymentId, transferProofStorageKey: storageKey,
    });
    if (!payment && proof && storageKey) await removeBestEffort(dependencies.remove, storageKey, "[PICKUP_TRANSFER_PROOF_ROLLBACK_CLEANUP]");
    if (payment && current.transferProofStorageKey && current.transferProofStorageKey !== storageKey) {
      await removeBestEffort(dependencies.remove, current.transferProofStorageKey, "[PICKUP_TRANSFER_PROOF_OLD_CLEANUP]");
    }
    return payment;
  } catch (error) {
    if (proof && storageKey) await removeBestEffort(dependencies.remove, storageKey, "[PICKUP_TRANSFER_PROOF_ROLLBACK_CLEANUP]");
    throw error;
  }
}

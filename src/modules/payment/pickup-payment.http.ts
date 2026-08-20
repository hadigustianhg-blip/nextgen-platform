import { z } from "zod";

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

export async function pickupPaymentRequestPayload(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    return { values: await request.json() as unknown, proof: null as File | null };
  }
  const form = await request.formData();
  const proofValue = form.get("transferProof");
  const values: Record<string, unknown> = Object.fromEntries([...form.entries()].filter(([key]) => key !== "transferProof"));
  if (typeof values.confirmOverpayment === "string") values.confirmOverpayment = values.confirmOverpayment === "true";
  return {
    values,
    proof: proofValue instanceof File && proofValue.size > 0 ? proofValue : null,
  };
}

export function pickupPaymentErrorStatus(code: string) {
  if (code === "TRANSFER_PROOF_STORAGE_NOT_CONFIGURED") return 503;
  if (code === "OVERPAYMENT_CONFIRMATION_REQUIRED") return 409;
  return 400;
}

export function firstValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message;
}

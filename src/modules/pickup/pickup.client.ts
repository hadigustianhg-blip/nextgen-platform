import "server-only";
import { pickupEnvelopeSchema, pickupRecordSchema } from "./pickup.validation";
import type { PickupEnvelope, PickupSourceRecord } from "./pickup.types";

const DEFAULT_PICKUP_URL =
  "https://jfs-middleware-v2-production.up.railway.app/jfs-pickup";

export class PickupSourceError extends Error {
  constructor(message = "Sinkronisasi pickup gagal.") {
    super(message);
    this.name = "PickupSourceError";
  }
}

export async function fetchPickupSource(
  operationalDate: string,
  options: { fetcher?: typeof fetch; baseUrl?: string } = {},
): Promise<PickupEnvelope> {
  const fetcher = options.fetcher ?? fetch;
  const url = new URL(options.baseUrl ?? process.env.JFS_PICKUP_URL ?? DEFAULT_PICKUP_URL);
  url.searchParams.set("date", operationalDate);

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      headers: { accept: "application/json" },
    });
  } catch {
    throw new PickupSourceError();
  }

  if (!response.ok) throw new PickupSourceError();

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PickupSourceError("Respons pickup tidak valid.");
  }

  const envelope = pickupEnvelopeSchema.safeParse(body);
  if (!envelope.success || envelope.data.total !== envelope.data.data.length) {
    throw new PickupSourceError("Respons pickup tidak lengkap.");
  }

  return {
    total: envelope.data.total,
    data: envelope.data.data as PickupSourceRecord[],
  };
}

export function validatePickupRecord(record: unknown) {
  return pickupRecordSchema.safeParse(record);
}

import "server-only";
import { sourceEnvelopeSchema } from "./delivery-settlement.validation";

const DEFAULT_BASE_URL = "https://jfs-middleware-v2-production.up.railway.app";

export class DeliverySourceError extends Error {
  constructor() {
    super("Sumber Delivery Settlement tidak tersedia.");
    this.name = "DeliverySourceError";
  }
}

export async function fetchDeliverySource(
  endpoint: "/jfs-dispatch" | "/jfs-cod",
  operationalDate: string,
  options: { fetcher?: typeof fetch; baseUrl?: string } = {},
) {
  const url = new URL(endpoint, options.baseUrl ?? process.env.JFS_MIDDLEWARE_URL ?? DEFAULT_BASE_URL);
  url.searchParams.set("date", operationalDate);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new DeliverySourceError();
    const parsed = sourceEnvelopeSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.total !== parsed.data.data.length) {
      throw new DeliverySourceError();
    }
    return parsed.data;
  } catch {
    throw new DeliverySourceError();
  }
}

import "server-only";
import { pickupEnvelopeSchema, pickupRecordSchema } from "./pickup.validation";
import type { PickupEnvelope, PickupSourceRecord } from "./pickup.types";
import { executeTrustedMultiOutletScraper, isSecurityFailure } from "@/modules/integrations/jfs-multi-outlet-client";
import type { SettingsScope } from "@/modules/settings/settings.types";

function resolvePickupUrl(baseUrl?: string) {
  const configured = baseUrl ?? process.env.JFS_PICKUP_URL ?? process.env.JFS_MIDDLEWARE_BASE_URL;
  if (!configured) {
    throw new PickupSourceError("JFS pickup source is not configured.");
  }

  const url = new URL(configured);
  if (!baseUrl && !process.env.JFS_PICKUP_URL) {
    url.pathname = "/jfs-pickup";
  }
  return url;
}

export class PickupSourceError extends Error {
  constructor(message = "Sinkronisasi pickup gagal.") {
    super(message);
    this.name = "PickupSourceError";
  }
}

export async function fetchPickupSource(
  operationalDate: string,
  options: { fetcher?: typeof fetch; baseUrl?: string; scope?: SettingsScope } = {},
): Promise<PickupEnvelope> {
  if (options.scope) {
    try {
      const result = await executeTrustedMultiOutletScraper(options.scope, "PICKUP", {
        date: operationalDate,
        fetcher: options.fetcher,
      });

      const body = result.data ? result : { total: result.total ?? 0, data: result.data ?? [] };
      const envelope = pickupEnvelopeSchema.safeParse(body);
      if (envelope.success && envelope.data.total === envelope.data.data.length) {
        return {
          total: envelope.data.total,
          data: envelope.data.data as PickupSourceRecord[],
        };
      }
    } catch (err) {
      if (isSecurityFailure(err)) throw err;
      console.warn(`[MultiOutletFallback] PICKUP multi-outlet fetch failed, falling back to legacy GET /jfs-pickup:`, err instanceof Error ? err.message : err);
      // Fallback to legacy GET endpoint for unconfigured or degraded outlets
    }
  }

  const fetcher = options.fetcher ?? fetch;
  const url = resolvePickupUrl(options.baseUrl);
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

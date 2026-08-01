import "server-only";
import { sourceEnvelopeSchema } from "./delivery-settlement.validation";

export type DeliveryFetchErrorCode =
  | "SYNC_FETCH_DISPATCH_FAILED"
  | "SYNC_FETCH_COD_FAILED"
  | "SYNC_RESPONSE_INVALID"
  | "SYNC_TIMEOUT"
  | "SYNC_CONFIG_INVALID";

type FetchDiagnostic = {
  endpoint: "/jfs-dispatch" | "/jfs-cod";
  httpStatus: number | null;
  contentType: string | null;
  attemptCount: number;
  durationMs: number;
};

const endpointCode = (endpoint: "/jfs-dispatch" | "/jfs-cod") =>
  endpoint === "/jfs-dispatch" ? "SYNC_FETCH_DISPATCH_FAILED" : "SYNC_FETCH_COD_FAILED";

export class DeliverySourceError extends Error {
  constructor(readonly diagnostic: FetchDiagnostic & {
    code: DeliveryFetchErrorCode;
    target: string;
    bodyPreview: string | null;
    connectionCode: string | null;
  }) {
    super("Sumber Delivery Settlement tidak tersedia.");
    this.name = "DeliverySourceError";
  }
}

export function resolveDeliveryMiddlewareBaseUrl(value = process.env.JFS_MIDDLEWARE_BASE_URL) {
  if (!value) throw new DeliverySourceError({
    code: "SYNC_CONFIG_INVALID", endpoint: "/jfs-dispatch", target: "unconfigured",
    httpStatus: null, contentType: null, bodyPreview: null, connectionCode: "ENV_MISSING",
    attemptCount: 0, durationMs: 0,
  });
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) ||
      (process.env.NODE_ENV === "production" && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname)) ||
      (url.pathname !== "/" && url.pathname !== "")) {
      throw new Error("invalid base URL");
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    throw new DeliverySourceError({
      code: "SYNC_CONFIG_INVALID", endpoint: "/jfs-dispatch", target: "invalid-configured-host",
      httpStatus: null, contentType: null, bodyPreview: null, connectionCode: "ENV_INVALID",
      attemptCount: 0, durationMs: 0,
    });
  }
}

function safePreview(value: string) {
  return value.slice(0, 300)
    .replace(/("?(?:token|authtoken|authorization|cookie|password)"?\s*[:=]\s*)[^,\s<]+/gi, "$1[REDACTED]");
}

const retryableStatus = (status: number) => [502, 503, 504].includes(status);
const connectionCode = (error: unknown) => {
  if (error instanceof DOMException && error.name === "TimeoutError") return "TIMEOUT";
  if (error instanceof Error && error.name === "TimeoutError") return "TIMEOUT";
  const cause = error instanceof Error ? error.cause : null;
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") return cause.code;
  return null;
};

export async function fetchDeliverySource(
  endpoint: "/jfs-dispatch" | "/jfs-cod",
  operationalDate: string,
  options: {
    fetcher?: typeof fetch;
    baseUrl?: string;
    timeoutMs?: number;
    maxAttempts?: number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
) {
  const url = new URL(endpoint, resolveDeliveryMiddlewareBaseUrl(options.baseUrl));
  url.searchParams.set("date", operationalDate);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET", cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      });
    } catch (error) {
      const networkCode = connectionCode(error);
      const retryable = networkCode === "TIMEOUT" || networkCode === "ECONNRESET";
      if (retryable && attempt < maxAttempts) {
        await sleep(attempt * 250);
        continue;
      }
      throw new DeliverySourceError({
        code: networkCode === "TIMEOUT" ? "SYNC_TIMEOUT" : endpointCode(endpoint),
        endpoint, target: `${url.origin}${url.pathname}?date=${operationalDate}`,
        httpStatus: null, contentType: null, bodyPreview: null,
        connectionCode: networkCode, attemptCount: attempt, durationMs: Date.now() - startedAt,
      });
    }

    const contentType = response.headers.get("content-type");
    const body = await response.text();
    if (!response.ok) {
      if (retryableStatus(response.status) && attempt < maxAttempts) {
        await sleep(attempt * 250);
        continue;
      }
      throw new DeliverySourceError({
        code: endpointCode(endpoint), endpoint,
        target: `${url.origin}${url.pathname}?date=${operationalDate}`,
        httpStatus: response.status, contentType, bodyPreview: safePreview(body),
        connectionCode: null, attemptCount: attempt, durationMs: Date.now() - startedAt,
      });
    }
    if (!contentType?.toLowerCase().includes("application/json")) {
      throw new DeliverySourceError({
        code: "SYNC_RESPONSE_INVALID", endpoint,
        target: `${url.origin}${url.pathname}?date=${operationalDate}`,
        httpStatus: response.status, contentType, bodyPreview: safePreview(body),
        connectionCode: null, attemptCount: attempt, durationMs: Date.now() - startedAt,
      });
    }
    let json: unknown;
    try { json = JSON.parse(body); } catch {
      throw new DeliverySourceError({
        code: "SYNC_RESPONSE_INVALID", endpoint,
        target: `${url.origin}${url.pathname}?date=${operationalDate}`,
        httpStatus: response.status, contentType, bodyPreview: safePreview(body),
        connectionCode: null, attemptCount: attempt, durationMs: Date.now() - startedAt,
      });
    }
    const parsed = sourceEnvelopeSchema.safeParse(json);
    if (!parsed.success || parsed.data.total !== parsed.data.data.length) {
      throw new DeliverySourceError({
        code: "SYNC_RESPONSE_INVALID", endpoint,
        target: `${url.origin}${url.pathname}?date=${operationalDate}`,
        httpStatus: response.status, contentType, bodyPreview: null,
        connectionCode: null, attemptCount: attempt, durationMs: Date.now() - startedAt,
      });
    }
    return { ...parsed.data, diagnostic: {
      endpoint, httpStatus: response.status, contentType,
      attemptCount: attempt, durationMs: Date.now() - startedAt,
    } satisfies FetchDiagnostic };
  }
  throw new Error("Unreachable delivery fetch state");
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { executeTrustedMultiOutletScraper } from "@/modules/integrations/jfs-multi-outlet-client";
import {
  getAccessibleInvoiceSourceByWaybill, getInvoice, InvoiceServiceError,
} from "./invoice.service";

type Scope = { tenantId: string; outletId: string };
type MiddlewareRecipient = {
  senderName?: unknown;
  senderMobilePhone?: unknown;
  senderCityName?: unknown;
};

const WAYBILL_PATTERN = /^\d{8,20}$/;
const nullableText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function representativeInvoiceWaybill(
  items: Array<{ waybillNumber: string | null }>,
) {
  return items
    .map((item) => item.waybillNumber?.trim() ?? "")
    .find((waybill) => WAYBILL_PATTERN.test(waybill)) ?? null;
}

export function buildSenderDetailUrl(baseUrl: string, waybillNo: string) {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBase) {
    throw new InvoiceServiceError("JFS_MIDDLEWARE_NOT_CONFIGURED", 500);
  }
  try {
    const parsed = new URL(normalizedBase);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new InvoiceServiceError("JFS_MIDDLEWARE_NOT_CONFIGURED", 500);
  }
  return `${normalizedBase}/jfs-sender-detail?waybillNo=${encodeURIComponent(waybillNo)}`;
}

export function mapMiddlewareRecipient(data: MiddlewareRecipient | null | undefined) {
  return {
    recipientName: nullableText(data?.senderName),
    recipientPhone: nullableText(data?.senderMobilePhone),
    recipientCity: nullableText(data?.senderCityName),
  };
}

function middlewareError(status: number, code?: string) {
  if (code === "SENDER_DETAIL_NOT_FOUND" || status === 404) {
    return new InvoiceServiceError("SENDER_DETAIL_NOT_FOUND", 404);
  }
  if (code === "INVALID_WAYBILL_NO" || status === 400) {
    return new InvoiceServiceError("INVALID_WAYBILL_NO", 400);
  }
  if (code === "JFS_AUTH_NOT_CONFIGURED") {
    return new InvoiceServiceError("JFS_AUTH_NOT_CONFIGURED", 502);
  }
  if (code === "JFS_AUTH_EXPIRED") {
    return new InvoiceServiceError("JFS_AUTH_EXPIRED", 502);
  }
  if (code === "JFS_UPSTREAM_TIMEOUT" || status === 504) {
    return new InvoiceServiceError("JFS_UPSTREAM_TIMEOUT", 504);
  }
  return new InvoiceServiceError("JFS_UPSTREAM_ERROR", 502);
}

async function requestMiddlewareRecipient(
  waybillNo: string,
  options: {
    fetcher?: typeof fetch;
    baseUrl?: string;
    timeoutMs?: number;
  } = {},
) {
  const url = buildSenderDetailUrl(
    options.baseUrl ?? process.env.JFS_MIDDLEWARE_BASE_URL ?? "",
    waybillNo,
  );
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "AbortError" || name === "TimeoutError") {
      throw new InvoiceServiceError("JFS_UPSTREAM_TIMEOUT", 504);
    }
    throw new InvoiceServiceError("JFS_UPSTREAM_ERROR", 502);
  }

  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    data?: MiddlewareRecipient;
    error?: { code?: string };
  } | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw middlewareError(response.status, payload?.error?.code);
  }

  const recipient = mapMiddlewareRecipient(payload.data);
  return { waybillNo, ...recipient };
}

async function requestScopedRecipient(
  scope: Scope,
  waybillNo: string,
  options: {
    fetcher?: typeof fetch;
    baseUrl?: string;
    timeoutMs?: number;
    executeScoped?: typeof executeTrustedMultiOutletScraper;
  } = {},
) {
  if ("baseUrl" in options) {
    return requestMiddlewareRecipient(waybillNo, options);
  }
  try {
    const result = await (options.executeScoped ?? executeTrustedMultiOutletScraper)(scope, "SENDER_DETAIL", {
      waybillNo,
      fetcher: options.fetcher,
    });
    if (!result?.data) throw new InvoiceServiceError("SENDER_DETAIL_NOT_FOUND", 404);
    return { waybillNo, ...mapMiddlewareRecipient(result.data as MiddlewareRecipient) };
  } catch (error) {
    if (error instanceof InvoiceServiceError) throw error;
    throw middlewareError(502, (error as { code?: string })?.code);
  }
}

export async function fetchSelectedRecipientDetail(
  scope: Scope,
  waybillNo: string,
  options: {
    fetcher?: typeof fetch;
    baseUrl?: string;
    timeoutMs?: number;
    executeScoped?: typeof executeTrustedMultiOutletScraper;
  } = {},
) {
  const normalizedWaybill = waybillNo.trim();
  if (!WAYBILL_PATTERN.test(normalizedWaybill)) {
    throw new InvoiceServiceError("INVALID_WAYBILL_NO", 400);
  }
  const accessible = await getAccessibleInvoiceSourceByWaybill(
    scope, normalizedWaybill,
  );
  if (!accessible) {
    throw new InvoiceServiceError("WAYBILL_NOT_ACCESSIBLE", 404);
  }
  return requestScopedRecipient(scope, normalizedWaybill, options);
}

export async function fetchInvoiceRecipientDetail(
  scope: Scope,
  invoiceId: string,
  options: {
    fetcher?: typeof fetch;
    baseUrl?: string;
    timeoutMs?: number;
    executeScoped?: typeof executeTrustedMultiOutletScraper;
  } = {},
) {
  const invoice = await getInvoice(scope, invoiceId);
  if (!invoice) throw new InvoiceServiceError("INVOICE_NOT_FOUND", 404);
  if (invoice.status !== "DRAFT") {
    throw new InvoiceServiceError("INVOICE_LOCKED", 409);
  }
  const waybillNo = representativeInvoiceWaybill(invoice.items);
  if (!waybillNo) {
    throw new InvoiceServiceError("INVOICE_WAYBILL_NOT_AVAILABLE", 422);
  }

  const recipient = await requestScopedRecipient(scope, waybillNo, options);
  const updated = await prisma.invoice.updateMany({
    where: { id: invoiceId, ...scope, status: "DRAFT" },
    data: {
      recipientName: recipient.recipientName,
      recipientPhone: recipient.recipientPhone,
      recipientCity: recipient.recipientCity,
      addressSnapshot: recipient.recipientCity,
    },
  });
  if (updated.count !== 1) {
    throw new InvoiceServiceError("INVOICE_LOCKED", 409);
  }

  return recipient;
}

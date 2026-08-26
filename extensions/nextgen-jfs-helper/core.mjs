export const JFS_WAYBILL_ENDPOINT =
  "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/add";
export const NEXTGEN_HELPER_BASE_URL = "https://dev.nextgen-platform.com";
export const WAYBILL_EVENT_TYPE = "NEXTGEN_JFS_WAYBILL_CREATED";
export const WAYBILL_DEDUP_TTL_MS = 60_000;

const WAYBILL_PATTERN = /^[A-Za-z0-9]{1,100}$/;

export function normalizeWaybillNo(value) {
  if (typeof value !== "string") return null;
  const waybillNo = value.trim();
  return WAYBILL_PATTERN.test(waybillNo) ? waybillNo : null;
}

export function matchesWaybillEndpoint(url, method) {
  if (String(method).toUpperCase() !== "POST") return false;
  try {
    const candidate = new URL(url, "https://jfs.jtcargo.co.id");
    const endpoint = new URL(JFS_WAYBILL_ENDPOINT);
    return candidate.origin === endpoint.origin && candidate.pathname === endpoint.pathname;
  } catch {
    return false;
  }
}

export function extractCreatedWaybill({ url, method, httpStatus, payload }) {
  if (!matchesWaybillEndpoint(url, method) || httpStatus !== 200) return null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.code !== 1 || payload.succ !== true || payload.fail !== false) return null;
  return normalizeWaybillNo(payload.data?.waybillNo);
}

export function isValidWaybillMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  return (
    message.type === WAYBILL_EVENT_TYPE &&
    normalizeWaybillNo(message.waybillNo) === message.waybillNo &&
    Object.keys(message).every((key) => key === "type" || key === "waybillNo")
  );
}

export function buildHelperUrl(waybillNo) {
  const normalized = normalizeWaybillNo(waybillNo);
  if (!normalized || NEXTGEN_HELPER_BASE_URL !== "https://dev.nextgen-platform.com") {
    throw new Error("INVALID_HELPER_TARGET");
  }
  const target = new URL("/helper/pickup-adjustment", NEXTGEN_HELPER_BASE_URL);
  target.searchParams.set("waybillNo", normalized);
  return target.toString();
}

export function createTtlDeduper(ttlMs = WAYBILL_DEDUP_TTL_MS) {
  const seen = new Map();
  return {
    accept(waybillNo, now = Date.now()) {
      const previous = seen.get(waybillNo);
      if (typeof previous === "number" && now - previous < ttlMs) return false;
      seen.set(waybillNo, now);
      for (const [key, timestamp] of seen) {
        if (now - timestamp >= ttlMs) seen.delete(key);
      }
      return true;
    },
  };
}

import {
  buildHelperUrl,
  isValidWaybillMessage,
  normalizeWaybillNo,
  WAYBILL_DEDUP_TTL_MS,
} from "./core.mjs";

const ALLOWED_SENDER_ORIGIN = "https://jfs.jtcargo.co.id";
const pendingKeys = new Set();

async function dedupStorageKey(waybillNo) {
  const bytes = new TextEncoder().encode(waybillNo);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `nextgen-waybill-${hash}`;
}

async function openHelperOnce(waybillNo) {
  const normalized = normalizeWaybillNo(waybillNo);
  if (!normalized) return;
  const storageKey = await dedupStorageKey(normalized);
  if (pendingKeys.has(storageKey)) return;
  pendingKeys.add(storageKey);
  try {
    const now = Date.now();
    const stored = await chrome.storage.session.get(storageKey);
    if (typeof stored[storageKey] === "number" && now - stored[storageKey] < WAYBILL_DEDUP_TTL_MS) return;
    await chrome.storage.session.set({ [storageKey]: now });
    const url = buildHelperUrl(normalized);
    try {
      await chrome.windows.create({ url, type: "popup", width: 560, height: 760, focused: true });
    } catch {
      await chrome.tabs.create({ url, active: true });
    }
  } finally {
    pendingKeys.delete(storageKey);
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!isValidWaybillMessage(message)) return;
  try {
    if (!sender.url || new URL(sender.url).origin !== ALLOWED_SENDER_ORIGIN) return;
  } catch {
    return;
  }
  void openHelperOnce(message.waybillNo);
});

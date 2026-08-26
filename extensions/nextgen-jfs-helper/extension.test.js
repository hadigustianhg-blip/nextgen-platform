import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  buildHelperUrl,
  createTtlDeduper,
  extractCreatedWaybill,
  JFS_WAYBILL_ENDPOINT,
  NEXTGEN_HELPER_BASE_URL,
} from "./core.mjs";

const validPayload = {
  code: 1,
  succ: true,
  fail: false,
  data: { waybillNo: "201712345678" },
};

describe("NEXTGEN DEV JFS waybill extension", () => {
  it("accepts only the exact POST endpoint and strong success contract", () => {
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "POST", httpStatus: 200, payload: validPayload })).toBe("201712345678");
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "POST", httpStatus: 200, payload: { ...validPayload, code: 0 } })).toBeNull();
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "POST", httpStatus: 200, payload: { ...validPayload, succ: false } })).toBeNull();
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "POST", httpStatus: 200, payload: { ...validPayload, fail: true } })).toBeNull();
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "POST", httpStatus: 200, payload: { ...validPayload, data: { waybillNo: "" } } })).toBeNull();
    expect(extractCreatedWaybill({ url: "https://jfsgw.jtcargo.co.id/networkmanagement/other", method: "POST", httpStatus: 200, payload: validPayload })).toBeNull();
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "GET", httpStatus: 200, payload: validPayload })).toBeNull();
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "POST", httpStatus: 500, payload: validPayload })).toBeNull();
    expect(extractCreatedWaybill({ url: JFS_WAYBILL_ENDPOINT, method: "POST", httpStatus: 200, payload: null })).toBeNull();
  });

  it("deduplicates the same waybill within TTL but accepts another waybill", () => {
    const deduper = createTtlDeduper(60_000);
    expect(deduper.accept("201712345678", 1_000)).toBe(true);
    expect(deduper.accept("201712345678", 30_000)).toBe(false);
    expect(deduper.accept("201700000001", 30_000)).toBe(true);
    expect(deduper.accept("201712345678", 61_001)).toBe(true);
  });

  it("builds only an encoded NEXTGEN DEV helper URL", () => {
    const target = new URL(buildHelperUrl("ABC123"));
    expect(NEXTGEN_HELPER_BASE_URL).toBe("https://dev.nextgen-platform.com");
    expect(target.origin).toBe(NEXTGEN_HELPER_BASE_URL);
    expect(target.pathname).toBe("/helper/pickup-adjustment");
    expect(target.searchParams.get("waybillNo")).toBe("ABC123");
    expect(buildHelperUrl("ABC123")).not.toContain("app." + "nextgen-platform.com");
  });

  it("keeps fetch transparent and reads only a cloned response", async () => {
    const source = await readFile(new URL("./page-bridge.js", import.meta.url), "utf8");
    const messages = [];
    const response = {
      status: 200,
      clone: vi.fn(() => ({ json: vi.fn().mockResolvedValue(validPayload) })),
    };
    const originalFetch = vi.fn().mockResolvedValue(response);
    class FakeXHR { open() {} send() {} addEventListener() {} }
    const window = {
      fetch: originalFetch,
      XMLHttpRequest: FakeXHR,
      location: { href: "https://jfs.jtcargo.co.id/", origin: "https://jfs.jtcargo.co.id" },
      postMessage: (message) => messages.push(message),
    };
    vm.runInNewContext(source, { window, URL, WeakMap, Object, String });
    const returned = await window.fetch(JFS_WAYBILL_ENDPOINT, { method: "POST" });
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(returned).toBe(response);
    expect(response.clone).toHaveBeenCalledOnce();
    expect(messages[0]).toEqual({ type: "NEXTGEN_JFS_WAYBILL_CREATED", waybillNo: "201712345678" });
  });

  it("preserves an original fetch rejection without a secondary unhandled rejection", async () => {
    const source = await readFile(new URL("./page-bridge.js", import.meta.url), "utf8");
    const messages = [];
    const originalError = new TypeError("Failed to fetch");
    const originalPromise = Promise.reject(originalError);
    const originalFetch = vi.fn(() => originalPromise);
    class FakeXHR { open() {} send() {} addEventListener() {} }
    const window = {
      fetch: originalFetch,
      XMLHttpRequest: FakeXHR,
      location: { href: "https://jfs.jtcargo.co.id/", origin: "https://jfs.jtcargo.co.id" },
      postMessage: (message) => messages.push(message),
    };
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      vm.runInNewContext(source, { window, URL, WeakMap, Object, String });
      const returned = window.fetch("https://open.feishu.cn/unrelated", { method: "GET" });
      expect(returned).toBe(originalPromise);
      await expect(returned).rejects.toBe(originalError);
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(messages).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("observes XHR loadend without replacing open/send results", async () => {
    const source = await readFile(new URL("./page-bridge.js", import.meta.url), "utf8");
    const messages = [];
    class FakeXHR {
      constructor() { this.listeners = {}; this.status = 200; this.responseType = "json"; this.response = validPayload; }
      open() { return "OPEN_RESULT"; }
      send() { this.listeners.loadend?.(); return "SEND_RESULT"; }
      addEventListener(type, listener) { this.listeners[type] = listener; }
    }
    const window = {
      fetch: undefined,
      XMLHttpRequest: FakeXHR,
      location: { href: "https://jfs.jtcargo.co.id/", origin: "https://jfs.jtcargo.co.id" },
      postMessage: (message) => messages.push(message),
    };
    vm.runInNewContext(source, { window, URL, WeakMap, Object, String, JSON });
    const xhr = new window.XMLHttpRequest();
    expect(xhr.open("POST", JFS_WAYBILL_ENDPOINT)).toBe("OPEN_RESULT");
    expect(xhr.send()).toBe("SEND_RESULT");
    expect(messages).toEqual([{ type: "NEXTGEN_JFS_WAYBILL_CREATED", waybillNo: "201712345678" }]);
  });

  it("has narrow permissions and no token, PII, persistence, or production target", async () => {
    const folder = new URL("./", import.meta.url);
    const [manifestText, bridge, content, worker] = await Promise.all([
      readFile(new URL("manifest.json", folder), "utf8"),
      readFile(new URL("page-bridge.js", folder), "utf8"),
      readFile(new URL("content-script.js", folder), "utf8"),
      readFile(new URL("service-worker.mjs", folder), "utf8"),
    ]);
    const manifest = JSON.parse(manifestText);
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts.flatMap((entry) => entry.matches)).toEqual([
      "https://jfs.jtcargo.co.id/*",
      "https://jfs.jtcargo.co.id/*",
    ]);
    const runtimeSource = [bridge, content, worker].join("\n");
    for (const forbidden of [
      "Auth" + "Token",
      "author" + "ization",
      "storage" + ".local",
      "sender" + "Phone",
      "receiver" + "Phone",
      "sender" + "Address",
      "receiver" + "Address",
      "app." + "nextgen-platform.com",
    ]) {
      expect(runtimeSource).not.toContain(forbidden);
    }
    expect(worker).toContain("chrome.storage.session");
    expect(worker).toContain('crypto.subtle.digest("SHA-256"');
  });
});

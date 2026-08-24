import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const executeScoped = vi.hoisted(() => vi.fn());
vi.mock("@/modules/integrations/jfs-multi-outlet-client", () => ({
  executeTrustedMultiOutletScraper: executeScoped,
}));

import {
  DeliverySourceError,
  fetchDeliverySource,
  resolveDeliveryMiddlewareBaseUrl,
} from "./delivery-settlement.client";

const baseUrl = "https://middleware.example.test";
const json = (value: unknown, status = 200, contentType = "application/json") =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": contentType } });

describe("Delivery Settlement middleware fetch", () => {
  it("uses scoped Dispatch for a server-resolved scope and never reaches legacy GET", async () => {
    executeScoped.mockResolvedValueOnce({ success: true, total: 0, data: [] });
    const legacyFetcher = vi.fn();
    const scope = { tenantId: "tenant-a", outletId: "outlet-a" };
    const result = await fetchDeliverySource("/jfs-dispatch", "2026-08-24", { scope, fetcher: legacyFetcher });
    expect(result.total).toBe(0);
    expect(executeScoped).toHaveBeenCalledWith(scope, "DISPATCH", expect.objectContaining({ date: "2026-08-24" }));
    expect(legacyFetcher).not.toHaveBeenCalled();
  });

  it("fails closed when scoped Dispatch fails without legacy fallback", async () => {
    executeScoped.mockRejectedValueOnce(new Error("scoped unavailable"));
    const legacyFetcher = vi.fn();
    await expect(fetchDeliverySource("/jfs-dispatch", "2026-08-24", {
      scope: { tenantId: "tenant-a", outletId: "outlet-a" }, fetcher: legacyFetcher,
    })).rejects.toMatchObject({ diagnostic: { code: "SYNC_FETCH_DISPATCH_FAILED", target: "scoped-middleware" } });
    expect(legacyFetcher).not.toHaveBeenCalled();
  });
  it("uses JFS_MIDDLEWARE_BASE_URL and normalizes its trailing slash", () => {
    expect(resolveDeliveryMiddlewareBaseUrl("https://middleware.example.test/").href)
      .toBe("https://middleware.example.test/");
    expect(() => resolveDeliveryMiddlewareBaseUrl("https://middleware.example.test/jfs-cod"))
      .toThrow(DeliverySourceError);
  });

  it("fails closed without a configured middleware URL", () => {
    vi.stubEnv("JFS_MIDDLEWARE_BASE_URL", "");
    vi.stubEnv("JFS_MIDDLEWARE_URL", "");
    expect(() => resolveDeliveryMiddlewareBaseUrl()).toThrow(DeliverySourceError);
    vi.unstubAllEnvs();
  });

  it("accepts the actual success/data/total envelope, including valid empty data", async () => {
    const fetcher = vi.fn(async () => json({ success: true, page: 1, total: 0, data: [] }));
    const result = await fetchDeliverySource("/jfs-dispatch", "2026-07-31", { baseUrl, fetcher });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.diagnostic).toMatchObject({ httpStatus: 200, attemptCount: 1 });
  });

  it.each([
    ["/jfs-dispatch", "SYNC_FETCH_DISPATCH_FAILED"],
    ["/jfs-cod", "SYNC_FETCH_COD_FAILED"],
  ] as const)("maps HTTP 500 from %s without retry", async (endpoint, code) => {
    const fetcher = vi.fn(async () => json({ error: "failed" }, 500));
    await expect(fetchDeliverySource(endpoint, "2026-07-31", { baseUrl, fetcher }))
      .rejects.toMatchObject({ diagnostic: { code, httpStatus: 500, attemptCount: 1 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries 502/503/504 and succeeds on the third attempt", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ error: "temporary" }, 502))
      .mockResolvedValueOnce(json({ error: "temporary" }, 503))
      .mockResolvedValueOnce(json({ success: true, total: 1, data: [{}] }));
    const result = await fetchDeliverySource("/jfs-cod", "2026-07-31", {
      baseUrl, fetcher, sleep: async () => {},
    });
    expect(result.diagnostic.attemptCount).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not retry 401", async () => {
    const fetcher = vi.fn(async () => json({ error: "unauthorized" }, 401));
    await expect(fetchDeliverySource("/jfs-cod", "2026-07-31", { baseUrl, fetcher }))
      .rejects.toMatchObject({ diagnostic: { code: "SYNC_FETCH_COD_FAILED", attemptCount: 1 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries timeout and exposes SYNC_TIMEOUT after the final attempt", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const fetcher = vi.fn(async () => { throw timeout; });
    await expect(fetchDeliverySource("/jfs-dispatch", "2026-07-31", {
      baseUrl, fetcher, sleep: async () => {},
    })).rejects.toMatchObject({ diagnostic: { code: "SYNC_TIMEOUT", attemptCount: 3 } });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["not-json", "application/json"],
    ["<html>upstream error</html>", "text/html"],
  ])("rejects invalid response contract without retry", async (body, contentType) => {
    const fetcher = vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": contentType } }));
    await expect(fetchDeliverySource("/jfs-cod", "2026-07-31", { baseUrl, fetcher }))
      .rejects.toMatchObject({ diagnostic: { code: "SYNC_RESPONSE_INVALID", attemptCount: 1 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("redacts credentials in the bounded error preview", async () => {
    const fetcher = vi.fn(async () => new Response(
      "token=secret-value password=private-value cookie=session-value",
      { status: 500, headers: { "content-type": "text/plain" } },
    ));
    let error: DeliverySourceError | null = null;
    try {
      await fetchDeliverySource("/jfs-dispatch", "2026-07-31", { baseUrl, fetcher });
    } catch (caught) {
      if (caught instanceof DeliverySourceError) error = caught;
    }
    expect(error).not.toBeNull();
    if (!error) throw new Error("Expected DeliverySourceError");
    expect(error.diagnostic.bodyPreview).not.toContain("secret-value");
    expect(error.diagnostic.bodyPreview).not.toContain("private-value");
    expect(error.diagnostic.bodyPreview).not.toContain("session-value");
    expect(error.diagnostic.bodyPreview!.length).toBeLessThanOrEqual(300);
  });
});

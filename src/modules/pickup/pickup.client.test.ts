import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const executeScoped = vi.hoisted(() => vi.fn());
vi.mock("@/modules/integrations/jfs-multi-outlet-client", () => ({
  executeTrustedMultiOutletScraper: executeScoped,
}));

import { fetchPickupSource, PickupSourceError } from "./pickup.client";

describe("pickup middleware client", () => {
  it("uses scoped Pickup for a server-resolved scope and never reaches legacy GET", async () => {
    executeScoped.mockResolvedValueOnce({ total: 0, data: [] });
    const legacyFetcher = vi.fn();
    const scope = { tenantId: "tenant-a", outletId: "outlet-a" };
    await expect(fetchPickupSource("2026-08-24", { scope, fetcher: legacyFetcher }))
      .resolves.toEqual({ total: 0, data: [] });
    expect(executeScoped).toHaveBeenCalledWith(scope, "PICKUP", expect.objectContaining({ date: "2026-08-24" }));
    expect(legacyFetcher).not.toHaveBeenCalled();
  });

  it("fails closed when scoped Pickup fails without legacy fallback", async () => {
    executeScoped.mockRejectedValueOnce(new Error("scoped unavailable"));
    const legacyFetcher = vi.fn();
    await expect(fetchPickupSource("2026-08-24", {
      scope: { tenantId: "tenant-a", outletId: "outlet-a" }, fetcher: legacyFetcher,
    })).rejects.toBeInstanceOf(PickupSourceError);
    expect(legacyFetcher).not.toHaveBeenCalled();
  });
  it("uses a fixture response and never requires production in tests", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify({ total: 0, data: [] }), { status: 200 });
    });
    const result = await fetchPickupSource("2026-07-28", {
      fetcher: fetcher as typeof fetch,
      baseUrl: "https://fixture.invalid/jfs-pickup",
    });
    expect(result.total).toBe(0);
    expect(String(fetcher.mock.calls[0][0])).toContain("fixture.invalid");
  });

  it("returns a safe error without exposing upstream details", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response("secret upstream trace", { status: 500 });
    });
    await expect(fetchPickupSource("2026-07-28", {
      fetcher: fetcher as typeof fetch,
      baseUrl: "https://fixture.invalid/jfs-pickup",
    })).rejects.toEqual(new PickupSourceError());
  });
});

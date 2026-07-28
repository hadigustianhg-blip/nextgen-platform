import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchPickupSource, PickupSourceError } from "./pickup.client";

describe("pickup middleware client", () => {
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

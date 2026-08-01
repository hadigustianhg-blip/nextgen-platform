import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  syncDeliverySettlement: vi.fn(),
}));
const MockDeliverySyncError = vi.hoisted(() => class extends Error {
  constructor(readonly reference: { requestId: string; stage: string; code: string }) {
    super("sync failed");
  }
});

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/delivery-settlement", async () => {
  const { z } = await import("zod");
  return {
    canSyncDelivery: () => true,
    DeliverySyncError: MockDeliverySyncError,
    deliveryOperationalDateSchema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deliveryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    syncDeliverySettlement: mocks.syncDeliverySettlement,
  };
});

import { POST } from "./route";

describe("POST /api/delivery-settlement/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ userId: "user-1" });
  });

  it("returns the normalization result for the requested business date", async () => {
    mocks.syncDeliverySettlement.mockResolvedValue({
      requestId: "request-1",
      status: "SUCCESS",
      cod: { unique: 77 },
    });
    const response = await POST(new Request("http://localhost/api/delivery-settlement/sync", {
      method: "POST",
      body: JSON.stringify({ operationalDate: "2026-07-31" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: "SUCCESS" } });
    expect(mocks.syncDeliverySettlement).toHaveBeenCalledWith(
      { tenantId: "tenant-1", outletId: "outlet-1", actorId: "user-1" },
      { operationalDate: "2026-07-31" },
    );
  });

  it("keeps the public error response safe when the transaction rolls back", async () => {
    mocks.syncDeliverySettlement.mockRejectedValue(new Error("database detail"));
    const response = await POST(new Request("http://localhost/api/delivery-settlement/sync", {
      method: "POST",
      body: JSON.stringify({ operationalDate: "2026-07-31" }),
    }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ error: {
      code: "DELIVERY_SYNC_FAILED",
      message: "Sinkronisasi Delivery Settlement gagal.",
    } });
    expect(JSON.stringify(body)).not.toContain("database detail");
  });

  it("returns a safe stage and reference for a COD fetch failure", async () => {
    mocks.syncDeliverySettlement.mockRejectedValue(new MockDeliverySyncError({
      requestId: "12345678-abcd-4000-8000-123456789012",
      stage: "FETCH_COD",
      code: "SYNC_FETCH_COD_FAILED",
    }));
    const response = await POST(new Request("http://localhost/api/delivery-settlement/sync", {
      method: "POST",
      body: JSON.stringify({ operationalDate: "2026-07-31" }),
    }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: {
      code: "SYNC_FETCH_COD_FAILED",
      stage: "FETCH_COD",
      requestId: "12345678-abcd-4000-8000-123456789012",
      message: "Sinkronisasi gagal saat mengambil data COD.",
    } });
  });
});

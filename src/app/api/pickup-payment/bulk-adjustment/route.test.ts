import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; outletId: string; userId: string; roles: string[] },
  service: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => mocks.session) }));
vi.mock("@/modules/payment", async () => {
  const { z } = await import("zod");
  return {
    bulkAdjustPickupPayments: mocks.service,
    canManagePickupPayment: (session: { roles: string[] }) => session.roles.includes("ADMIN"),
    pickupPaymentScope: (session: typeof mocks.session) => session?.outletId
      ? { tenantId: session.tenantId, outletId: session.outletId }
      : null,
    pickupPaymentBulkAdjustmentSchema: z.object({
      batchRequestId: z.string().uuid(),
      masterPickupIds: z.array(z.string().uuid()).min(1),
      paymentDate: z.string(),
      method: z.enum(["CASH", "TRANSFER"]),
      reference: z.string(), bank: z.string(), note: z.string(),
    }),
  };
});

import { POST } from "./route";

const input = {
  batchRequestId: "30000000-0000-4000-8000-000000000010",
  masterPickupIds: ["10000000-0000-4000-8000-000000000010"],
  paymentDate: "2026-07-29",
  method: "CASH",
  reference: "",
  bank: "",
  note: "",
};
const request = () => new Request("http://localhost/api/pickup-payment/bulk-adjustment", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(input),
});

describe("POST /api/pickup-payment/bulk-adjustment", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.service.mockReset();
  });

  it("rejects an unauthenticated or unauthorized user", async () => {
    expect((await POST(request())).status).toBe(401);
    mocks.session = {
      tenantId: "tenant", outletId: "outlet", userId: "user", roles: ["OPERATIONAL"],
    };
    expect((await POST(request())).status).toBe(403);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("uses session scope and returns a successful atomic batch", async () => {
    mocks.session = {
      tenantId: "tenant", outletId: "outlet", userId: "user", roles: ["ADMIN"],
    };
    mocks.service.mockResolvedValue({ adjustedCount: 1, totalAdjustment: "1000" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.service).toHaveBeenCalledWith(
      { tenantId: "tenant", outletId: "outlet", actorId: "user" },
      expect.objectContaining({ masterPickupIds: input.masterPickupIds }),
    );
  });

  it("rejects empty IDs and does not call the service", async () => {
    mocks.session = {
      tenantId: "tenant", outletId: "outlet", userId: "user", roles: ["ADMIN"],
    };
    const response = await POST(new Request("http://localhost/api/pickup-payment/bulk-adjustment", {
      method: "POST",
      body: JSON.stringify({ ...input, masterPickupIds: [] }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.service).not.toHaveBeenCalled();
  });
});

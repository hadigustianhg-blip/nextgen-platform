import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({
    tenantId: "tenant-1",
    outletId: "outlet-1",
    userId: "user-1",
    roles: ["ADMIN"],
  })),
}));
const mocks = vi.hoisted(() => ({ getInvoice: vi.fn() }));
vi.mock("@/modules/invoice", async () => {
  const actual = await vi.importActual<typeof import("@/modules/invoice")>(
    "@/modules/invoice",
  );
  return {
    ...actual,
    canReadInvoice: () => true,
    invoiceScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    getInvoice: mocks.getInvoice,
  };
});

import { Prisma } from "@prisma/client";
import { GET } from "./route";

describe("GET /api/finance/invoices/[id]", () => {
  it("returns a tenant-scoped, JSON-safe invoice detail response", async () => {
    mocks.getInvoice.mockResolvedValueOnce({
      id: "invoice-1",
      grandTotal: new Prisma.Decimal("90000.50"),
      invoiceDate: new Date("2026-07-30T00:00:00.000Z"),
      diagnosticBigInt: 12n,
    });
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "invoice-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.getInvoice).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "invoice-1");
    expect(await response.json()).toEqual({
      success: true,
      data: {
        id: "invoice-1",
        grandTotal: "90000.5",
        invoiceDate: "2026-07-30T00:00:00.000Z",
        diagnosticBigInt: "12",
      },
    });
  });

  it("returns 404 for an invoice outside the active scope", async () => {
    mocks.getInvoice.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "other-tenant-invoice" }),
    });
    expect(response.status).toBe(404);
  });
});

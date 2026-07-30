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
const mocks = vi.hoisted(() => ({
  fetchRecipient: vi.fn(),
}));
vi.mock("@/modules/invoice", async () => {
  const actual = await vi.importActual<typeof import("@/modules/invoice")>(
    "@/modules/invoice",
  );
  return {
    ...actual,
    canMutateInvoice: () => true,
    invoiceScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    fetchInvoiceRecipientDetail: mocks.fetchRecipient,
  };
});

import { InvoiceServiceError } from "@/modules/invoice";
import { GET } from "./route";

const context = {
  params: Promise.resolve({ id: "invoice-1" }),
};

describe("GET /api/finance/invoices/[id]/recipient-detail", () => {
  it("returns only the mapped scoped recipient snapshot", async () => {
    mocks.fetchRecipient.mockResolvedValueOnce({
      waybillNo: "201680658475",
      recipientName: "Recipient",
      recipientPhone: "087777376950",
      recipientCity: "Kab. Test",
    });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(mocks.fetchRecipient).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "invoice-1");
    expect(await response.json()).toEqual({
      success: true,
      data: {
        waybillNo: "201680658475",
        recipientName: "Recipient",
        recipientPhone: "087777376950",
        recipientCity: "Kab. Test",
      },
    });
  });

  it.each([
    ["INVOICE_NOT_FOUND", 404],
    ["INVOICE_WAYBILL_NOT_AVAILABLE", 422],
    ["SENDER_DETAIL_NOT_FOUND", 404],
    ["JFS_AUTH_EXPIRED", 502],
    ["JFS_UPSTREAM_ERROR", 502],
    ["JFS_UPSTREAM_TIMEOUT", 504],
  ])("returns the safe %s contract", async (code, status) => {
    mocks.fetchRecipient.mockRejectedValueOnce(
      new InvoiceServiceError(code, status),
    );
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(status);
    const payload = await response.json();
    expect(payload.error.code).toBe(code);
    expect(JSON.stringify(payload)).not.toContain("stack");
  });
});

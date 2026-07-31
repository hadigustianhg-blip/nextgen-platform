import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetchRecipient: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/invoice", async () => {
  const actual = await vi.importActual<typeof import("@/modules/invoice")>(
    "@/modules/invoice",
  );
  return {
    ...actual,
    canMutateInvoice: () => true,
    invoiceScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    fetchSelectedRecipientDetail: mocks.fetchRecipient,
  };
});

import { InvoiceServiceError } from "@/modules/invoice";
import { GET } from "./route";

describe("GET /api/finance/invoices/recipient-detail", () => {
  it("requires a session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await GET(new Request(
      "http://localhost/api/finance/invoices/recipient-detail?waybillNo=201671591862",
    ));
    expect(response.status).toBe(401);
    expect(mocks.fetchRecipient).not.toHaveBeenCalled();
  });

  it("passes the selected waybill through scoped validation and returns mapped fields only", async () => {
    mocks.getSession.mockResolvedValueOnce({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      userId: "user-1",
      roles: ["ADMIN"],
    });
    mocks.fetchRecipient.mockResolvedValueOnce({
      waybillNo: "201671591862",
      recipientName: "Customer",
      recipientPhone: "08123456789",
      recipientCity: "Bandung",
    });
    const response = await GET(new Request(
      "http://localhost/api/finance/invoices/recipient-detail?waybillNo=201671591862",
    ));
    expect(mocks.fetchRecipient).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "201671591862");
    expect(await response.json()).toEqual({
      success: true,
      data: {
        waybillNo: "201671591862",
        recipientName: "Customer",
        recipientPhone: "08123456789",
        recipientCity: "Bandung",
      },
    });
  });

  it.each([
    ["WAYBILL_NOT_ACCESSIBLE", 404],
    ["SENDER_DETAIL_NOT_FOUND", 404],
    ["JFS_UPSTREAM_TIMEOUT", 504],
  ])("maps %s without exposing upstream details", async (code, status) => {
    mocks.getSession.mockResolvedValueOnce({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      userId: "user-1",
      roles: ["ADMIN"],
    });
    mocks.fetchRecipient.mockRejectedValueOnce(
      new InvoiceServiceError(code, status),
    );
    const response = await GET(new Request(
      "http://localhost/api/finance/invoices/recipient-detail?waybillNo=201671591862",
    ));
    expect(response.status).toBe(status);
    const payload = await response.json();
    expect(payload.error.code).toBe(code);
    expect(JSON.stringify(payload)).not.toContain("stack");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({
    sessionId: "s",
    tenantId: "tenant-1",
    tenantName: "Tenant",
    userId: "user-1",
    userName: "User",
    email: "user@example.test",
    outletId: "outlet-1",
    outletCode: "OUT001",
    roles: ["ADMIN"],
  })),
}));
const mocks = vi.hoisted(() => ({ createInvoiceDraft: vi.fn() }));
vi.mock("@/modules/invoice", async () => {
  const actual = await vi.importActual<typeof import("@/modules/invoice")>(
    "@/modules/invoice",
  );
  return {
    ...actual,
    canMutateInvoice: () => true,
    canReadInvoice: () => true,
    invoiceScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    createInvoiceDraft: mocks.createInvoiceDraft,
  };
});

import { POST } from "./route";

describe("POST /api/finance/invoices", () => {
  it("rejects empty itemIds with the specific safe 400 contract", async () => {
    const response = await POST(new Request("http://localhost/api/finance/invoices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerKey: "name:putra",
        customerName: "PUTRA",
        invoiceDate: "2026-07-30",
        dueDate: "2026-08-06",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-30",
        itemIds: [],
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      code: "INVOICE_ITEMS_REQUIRED",
      message: "Pilih minimal satu resi untuk membuat invoice.",
    });
    expect(mocks.createInvoiceDraft).not.toHaveBeenCalled();
  });
});

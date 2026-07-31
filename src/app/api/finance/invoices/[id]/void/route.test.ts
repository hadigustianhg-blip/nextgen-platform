import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  voidInvoice: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/invoice", async () => {
  const actual = await vi.importActual<typeof import("@/modules/invoice")>(
    "@/modules/invoice",
  );
  return {
    ...actual,
    canVoidInvoice: () => true,
    invoiceScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    voidInvoice: mocks.voidInvoice,
  };
});

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "invoice-1" }) };
const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  outletCode: "OUT001",
  userId: "user-1",
  roles: ["ADMIN"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
});

describe("POST /api/finance/invoices/[id]/void", () => {
  it("passes trimmed reason and server-side session scope to the service", async () => {
    mocks.voidInvoice.mockResolvedValueOnce({
      id: "invoice-1",
      invoiceNumber: "INV/OUT001/2026/07/0001",
      status: "VOID",
      voidReason: "Kesalahan nominal",
    });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        reason: " Kesalahan nominal ",
        tenantId: "tenant-other",
        outletId: "outlet-other",
      }),
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.voidInvoice).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
      actorId: "user-1",
      outletCode: "OUT001",
    }, "invoice-1", "Kesalahan nominal");
  });

  it.each(["", "   ", "abc"])("rejects invalid reason %j", async (reason) => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ reason }),
    }), context);
    expect(response.status).toBe(400);
    expect(mocks.voidInvoice).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ reason: "Alasan valid" }),
    }), context);
    expect(response.status).toBe(401);
  });
});

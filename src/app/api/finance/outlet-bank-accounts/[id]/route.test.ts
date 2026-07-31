import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({
    tenantId: "tenant-1",
    outletId: "outlet-1",
    userId: "user-1",
    roles: ["ADMIN"],
  })),
}));
vi.mock("@/modules/invoice", async () => {
  const actual = await vi.importActual<typeof import("@/modules/invoice")>(
    "@/modules/invoice",
  );
  return {
    ...actual,
    canMutateInvoice: () => true,
    invoiceScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    updateOutletBankAccount: mocks.update,
  };
});

import { PATCH } from "./route";

describe("PATCH /api/finance/outlet-bank-accounts/[id]", () => {
  it("updates only within the session scope", async () => {
    mocks.update.mockResolvedValueOnce({
      id: "account-1",
      bankName: "Bank",
      accountNumber: "001",
      accountHolder: "Outlet",
      isDefault: true,
    });
    const response = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({
        bankName: "Bank",
        accountNumber: "001",
        accountHolder: "Outlet",
        isDefault: true,
      }),
    }), { params: Promise.resolve({ id: "account-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "account-1", {
      bankName: "Bank",
      accountNumber: "001",
      accountHolder: "Outlet",
      isDefault: true,
    });
  });
});

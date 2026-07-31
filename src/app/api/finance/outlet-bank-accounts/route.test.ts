import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
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
    getActiveOutletBankAccounts: mocks.list,
    createOutletBankAccount: mocks.create,
  };
});

import { GET, POST } from "./route";

const session = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  userId: "user-1",
  roles: ["ADMIN"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
});

describe("/api/finance/outlet-bank-accounts", () => {
  it("requires a session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
  });

  it("lists only the active session scope", async () => {
    mocks.list.mockResolvedValueOnce([{
      id: "account-1",
      bankName: "Bank",
      accountNumber: "001",
      accountHolder: "Outlet",
      isDefault: true,
    }]);
    const response = await GET();
    expect(mocks.list).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    });
    const payload = await response.json();
    expect(payload.data[0]).not.toHaveProperty("tenantId");
    expect(payload.data[0]).not.toHaveProperty("outletId");
  });

  it("validates and creates an account without accepting browser scope", async () => {
    mocks.create.mockResolvedValueOnce({
      id: "account-1",
      bankName: "Bank",
      accountNumber: "001234",
      accountHolder: "Outlet",
      isDefault: true,
    });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        tenantId: "other-tenant",
        outletId: "other-outlet",
        bankName: " Bank ",
        accountNumber: " 001 234 ",
        accountHolder: " Outlet ",
        isDefault: true,
      }),
    }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, {
      bankName: "Bank",
      accountNumber: "001234",
      accountHolder: "Outlet",
      isDefault: true,
    });
  });

  it.each([
    { bankName: "", accountNumber: "001", accountHolder: "Outlet" },
    { bankName: "Bank", accountNumber: "", accountHolder: "Outlet" },
    { bankName: "Bank", accountNumber: "001", accountHolder: "" },
  ])("rejects incomplete account data %#", async (body) => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
    }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

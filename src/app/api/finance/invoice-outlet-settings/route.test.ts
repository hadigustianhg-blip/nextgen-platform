import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
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
    getInvoiceOutletSettings: mocks.getSettings,
    updateInvoiceOutletSettings: mocks.updateSettings,
  };
});

import { GET, PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    tenantId: "tenant-1",
    outletId: "outlet-1",
    userId: "user-1",
    roles: ["ADMIN"],
  });
});

describe("/api/finance/invoice-outlet-settings", () => {
  it("returns only the scoped outlet configuration", async () => {
    mocks.getSettings.mockResolvedValueOnce({
      adminWhatsapp: null,
      tenantAdminWhatsapp: null,
      effectiveAdminWhatsapp: null,
    });
    expect((await GET()).status).toBe(200);
    expect(mocks.getSettings).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    });
  });

  it("does not accept tenant or outlet scope from the browser", async () => {
    mocks.updateSettings.mockResolvedValueOnce({
      adminWhatsapp: "081234567890",
    });
    const response = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({
        tenantId: "tenant-other",
        outletId: "outlet-other",
        adminWhatsapp: "081234567890",
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "081234567890");
  });
});

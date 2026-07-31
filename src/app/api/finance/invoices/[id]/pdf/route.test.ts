import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getInvoice: vi.fn(),
  createPdf: vi.fn(),
  auditCreate: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { auditLog: { create: mocks.auditCreate } },
}));
vi.mock("@/modules/invoice", () => ({
  canExportInvoice: () => true,
  invoiceScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
  getInvoice: mocks.getInvoice,
  createInvoicePdf: mocks.createPdf,
  invoicePdfFilename: () => "Invoice_DRAFT_Seller.pdf",
}));

import { GET } from "./route";

const invoice = (status = "DRAFT") => ({
  id: "invoice-1",
  status,
  invoiceNumber: status === "DRAFT" ? null : "INV/OUT/2026/07/0001",
  customerKey: "name:seller",
  customerNameSnapshot: "Seller",
  companyNameSnapshot: null,
  whatsappSnapshot: null,
  addressSnapshot: null,
  invoiceDate: new Date("2026-07-30T00:00:00.000Z"),
  dueDate: new Date("2026-08-06T00:00:00.000Z"),
  periodStart: new Date("2026-07-01T00:00:00.000Z"),
  periodEnd: new Date("2026-07-30T00:00:00.000Z"),
  subtotal: { toString: () => "100000" },
  discountTotal: { toString: () => "0" },
  grandTotal: { toString: () => "100000" },
  tenant: { name: "Tenant" },
  outlet: { code: "OUT001", name: "Outlet" },
  items: [{ id: "item-1" }],
});

const context = {
  params: Promise.resolve({ id: "invoice-1" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getInvoice.mockResolvedValue(invoice());
  mocks.createPdf.mockImplementation(async (_invoice, _accounts, options) => {
    for (const phase of [
      "pdf_start",
      "logo_loaded",
      "pdf_document_created",
      "font_loaded",
      "header_rendered",
      "items_rendered",
      "table_rendered",
      "totals_rendered",
      "pdf_finalized",
      "pdf_end",
    ]) options.onPhase(phase);
    return Buffer.from("%PDF-test");
  });
  mocks.auditCreate.mockResolvedValue({ id: 1n });
});

describe("GET /api/finance/invoices/[id]/pdf", () => {
  it("returns 404 when the scoped invoice is not found", async () => {
    mocks.getInvoice.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      code: "INVOICE_NOT_FOUND",
      message: "Invoice tidak ditemukan.",
    });
  });

  it.each(["DRAFT", "ISSUED", "VOID"])(
    "generates a complete PDF response for %s",
    async (status) => {
      mocks.getInvoice.mockResolvedValueOnce(invoice(status));
      const response = await GET(new Request("http://localhost"), context);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain(
        'filename="Invoice_DRAFT_Seller.pdf"',
      );
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString())
        .toBe("%PDF");
    },
  );

  it("allows empty bank accounts and nullable optional identity fields", async () => {
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(mocks.createPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: null,
        companyNameSnapshot: null,
        addressSnapshot: null,
      }),
      [],
      expect.any(Object),
    );
  });

  it("renders only the immutable payment account snapshot stored on the invoice", async () => {
    mocks.getInvoice.mockResolvedValueOnce({
      ...invoice(),
      transferBankName: "Bank Outlet",
      transferAccountNumber: "123456789",
      transferAccountHolder: "Outlet Holder",
    });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(mocks.createPdf).toHaveBeenCalledWith(
      expect.any(Object),
      [{
        bankName: "Bank Outlet",
        accountNumber: "123456789",
        accountHolder: "Outlet Holder",
      }],
      expect.any(Object),
    );
  });

  it("rejects incomplete PDF data with a specific contract", async () => {
    mocks.getInvoice.mockResolvedValueOnce({ ...invoice(), items: [] });
    const incompleteResponse = await GET(new Request("http://localhost"), context);
    expect(incompleteResponse.status).toBe(422);
    expect(await incompleteResponse.json()).toMatchObject({
      code: "INVOICE_PDF_DATA_INCOMPLETE",
    });
  });

  it("returns a specific error when outlet identity is incomplete", async () => {
    mocks.getInvoice.mockResolvedValueOnce({
      ...invoice(),
      outlet: { code: "OUT001", name: "" },
    });
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "OUTLET_SETTINGS_INCOMPLETE",
    });
  });

  it("returns a safe generation failure without leaking PDFKit details", async () => {
    mocks.createPdf.mockRejectedValueOnce(new Error("PDFKit internal failure"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      code: "INVOICE_PDF_GENERATION_FAILED",
      message: "PDF invoice gagal dibuat.",
    });
    expect(errorLog).toHaveBeenCalledWith(
      "[invoice.pdf.failed]",
      expect.objectContaining({
        invoiceId: "invoice-1",
        invoiceStatus: "DRAFT",
        phase: "bank_accounts_loaded",
        message: "PDFKit internal failure",
      }),
    );
    errorLog.mockRestore();
  });
});

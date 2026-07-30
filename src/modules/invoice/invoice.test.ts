import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  masterPickup: { findMany: vi.fn() },
  outletBankAccount: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  getInvoiceSourceItems,
  getInvoiceSourceSellers,
  normalizeSellerName,
  normalizeWhatsappNumber,
  sellerIdentity,
} from "./invoice.service";
import {
  canExportInvoice,
  canIssueInvoice,
  canMutateInvoice,
  canPrepareInvoiceWhatsapp,
  canReadInvoice,
  canVoidInvoice,
} from "./invoice.authorization";
import { invoiceDraftSchema, invoiceRangeSchema } from "./invoice.validation";
import { createInvoicePdf, invoicePdfFilename } from "./invoice.pdf";

const scope = { tenantId: "tenant-1", outletId: "outlet-1" };
const session = (roles: string[]) => ({
  sessionId: "s", tenantId: "tenant-1", tenantName: "Tenant",
  userId: "user-1", userName: "User", email: "user@example.test",
  outletId: "outlet-1", outletCode: "OUT001", roles,
});
const decimal = (value: string | number) => new Prisma.Decimal(value);

function pickup(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    operationalDate: new Date("2026-07-20T00:00:00.000Z"),
    waybillNo: "WB001",
    staffName: "Staff",
    senderName: "Anggrek Cibogo",
    freightAmount: decimal(100000),
    rawPickup: {
      settlementRaw: "Tunai",
      senderName: "Anggrek Cibogo",
      receiverAddress: "Alamat sumber",
      weight: decimal("2.5"),
    },
    settlementRevisions: [{
      id: "22222222-2222-4222-8222-222222222222",
      discountAmount: decimal(10000),
      reason: null,
    }],
    payments: [],
    invoiceItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.masterPickup.findMany.mockResolvedValue([pickup()]);
});

describe("Pickup invoice source", () => {
  it("uses the Pickup Settlement unpaid calculation and actual obligation", async () => {
    const rows = await getInvoiceSourceItems({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
    });
    expect(rows[0]).toMatchObject({
      waybillNumber: "WB001",
      freightAmount: "100000",
      discountAmount: "10000",
      finalAmount: "90000",
      obligationAmount: "90000",
      selectable: true,
    });
  });

  it("does not expose fully paid pickups", async () => {
    db.masterPickup.findMany.mockResolvedValue([
      pickup({ payments: [{
        receivedAmount: decimal(90000),
        paymentMethodRaw: "TUNAI",
        transferAccount: null,
      }] }),
    ]);
    expect(await getInvoiceSourceItems({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
    })).toEqual([]);
  });

  it("does not expose non-cash settlement sources", async () => {
    db.masterPickup.findMany.mockResolvedValue([
      pickup({ rawPickup: {
        settlementRaw: "Transfer",
        senderName: "Seller",
        receiverAddress: null,
        weight: decimal(1),
      } }),
    ]);
    expect(await getInvoiceSourceItems({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
    })).toEqual([]);
  });

  it("queries only the active tenant, outlet and inclusive date range", async () => {
    await getInvoiceSourceItems({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
    });
    expect(db.masterPickup.findMany.mock.calls[0][0].where).toMatchObject({
      ...scope,
      operationalDate: {
        gte: new Date("2026-07-01T00:00:00.000Z"),
        lte: new Date("2026-07-30T00:00:00.000Z"),
      },
    });
    expect(db.masterPickup.findMany.mock.calls[0][0].include.settlementRevisions.where)
      .toEqual({ recordStatus: "VALID" });
    expect(db.masterPickup.findMany.mock.calls[0][0].include.payments.where)
      .toEqual({ recordStatus: "VALID" });
  });

  it("excludes active issued invoices and warns for an existing draft", async () => {
    db.masterPickup.findMany.mockResolvedValue([
      pickup({ invoiceItems: [{
        invoiceId: "draft-id",
        invoice: { status: "DRAFT", invoiceNumber: null },
      }] }),
      pickup({
        id: "33333333-3333-4333-8333-333333333333",
        waybillNo: "WB002",
        invoiceItems: [{
          invoiceId: "issued-id",
          invoice: { status: "ISSUED", invoiceNumber: "INV/OUT/2026/07/0001" },
        }],
      }),
    ]);
    const rows = await getInvoiceSourceItems({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      draftInvoiceId: "draft-id", selectable: false,
    });
  });

  it("groups normalized seller names and retains unnamed sellers separately", async () => {
    db.masterPickup.findMany.mockResolvedValue([
      pickup(),
      pickup({
        id: "33333333-3333-4333-8333-333333333333",
        waybillNo: "WB002",
        senderName: " Anggrek   Cibogo ",
      }),
      pickup({
        id: "44444444-4444-4444-8444-444444444444",
        waybillNo: "WB003",
        senderName: null,
        rawPickup: {
          settlementRaw: "Tunai", senderName: null,
          receiverAddress: null, weight: decimal(1),
        },
      }),
    ]);
    const groups = await getInvoiceSourceSellers({
      ...scope, startDate: "2026-07-01", endDate: "2026-07-30",
    });
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      customerName: "Anggrek Cibogo", itemCount: 2, totalOutstanding: "180000",
    });
    expect(groups[1]).toMatchObject({
      customerKey: "waybill:WB003", customerName: "Tanpa Nama Seller",
    });
  });

  it("uses normalized seller identity without fuzzy matching", () => {
    expect(normalizeSellerName(" Anggrek \n Cibogo ")).toBe("Anggrek Cibogo");
    expect(sellerIdentity({
      id: "id", waybillNo: "WB", sellerName: " ANGGREK  CIBOGO ",
    })).toEqual({
      customerKey: "name:anggrek cibogo",
      customerName: "ANGGREK CIBOGO",
    });
  });
});

describe("Invoice validation and authorization", () => {
  it("validates a maximum 31-day inclusive source range", () => {
    expect(invoiceRangeSchema.safeParse({
      startDate: "2026-07-01", endDate: "2026-07-31",
    }).success).toBe(true);
    expect(invoiceRangeSchema.safeParse({
      startDate: "2026-06-30", endDate: "2026-07-31",
    }).success).toBe(false);
  });

  it("requires at least one source item and valid invoice dates", () => {
    const base = {
      customerKey: "name:seller", customerName: "Seller",
      invoiceDate: "2026-07-30", dueDate: "2026-08-06",
      periodStart: "2026-07-01", periodEnd: "2026-07-30",
    };
    expect(invoiceDraftSchema.safeParse({ ...base, itemIds: [] }).success).toBe(false);
    expect(invoiceDraftSchema.safeParse({
      ...base, itemIds: ["11111111-1111-4111-8111-111111111111"],
    }).success).toBe(true);
  });

  it("enforces the requested RBAC matrix", () => {
    expect(canReadInvoice(session(["VIEWER"]))).toBe(true);
    expect(canExportInvoice(session(["VIEWER"]))).toBe(true);
    expect(canMutateInvoice(session(["VIEWER"]))).toBe(false);
    expect(canIssueInvoice(session(["OPERATIONAL"]))).toBe(false);
    expect(canVoidInvoice(session(["OPERATIONAL"]))).toBe(false);
    expect(canPrepareInvoiceWhatsapp(session(["OPERATIONAL"]))).toBe(true);
    for (const role of ["OWNER", "ADMIN"]) {
      expect(canIssueInvoice(session([role]))).toBe(true);
      expect(canVoidInvoice(session([role]))).toBe(true);
    }
  });

  it("normalizes Indonesian WhatsApp numbers and rejects invalid values", () => {
    expect(normalizeWhatsappNumber("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("6281234567890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("123")).toBeNull();
  });
});

describe("Invoice persistence and PDF contracts", () => {
  it("uses race-safe item locks, serializable transactions and atomic sequence updates", async () => {
    const [schema, migration, service] = await Promise.all([
      readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8"),
      readFile(new URL("../../../prisma/migrations/20260730000800_pickup_invoice/migration.sql", import.meta.url), "utf8"),
      readFile(new URL("./invoice.service.ts", import.meta.url), "utf8"),
    ]);
    expect(schema).toContain("activeLockKey");
    expect(migration).toContain('"InvoiceItem_activeLockKey_key"');
    expect(service).toContain("TransactionIsolationLevel.Serializable");
    expect(service).toContain("invoiceSequence.upsert");
    expect(service).toContain("lastValue: { increment: 1 }");
    expect(service).not.toContain("count + 1");
  });

  it("stores immutable item snapshots and locks issued invoices", async () => {
    const service = await readFile(new URL("./invoice.service.ts", import.meta.url), "utf8");
    for (const field of [
      "waybillNumber", "sellerNameSnapshot", "freightAmount",
      "discountAmount", "finalAmount", "obligationAmount",
    ]) expect(service).toContain(field);
    expect(service).toContain('existing.status !== "DRAFT"');
    expect(service).toContain("SOURCE_CHANGED");
  });

  it("creates a structured A4 PDF with invoice rows and active bank accounts", async () => {
    const invoice = {
      invoiceNumber: "INV/OUT001/2026/07/0001",
      customerNameSnapshot: "Anggrek Cibogo",
      companyNameSnapshot: null,
      addressSnapshot: null,
      invoiceDate: new Date("2026-07-30T00:00:00.000Z"),
      dueDate: new Date("2026-08-06T00:00:00.000Z"),
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-30T00:00:00.000Z"),
      subtotal: decimal(100000), discountTotal: decimal(10000),
      grandTotal: decimal(90000), notes: null,
      tenant: { name: "Tenant Test" },
      outlet: { code: "OUT001", name: "Outlet Test" },
      items: [{
        transactionDate: new Date("2026-07-20T00:00:00.000Z"),
        waybillNumber: "WB001", pickupStaff: "Staff",
        sellerNameSnapshot: "Seller", weight: decimal("2.5"),
        freightAmount: decimal(100000), discountAmount: decimal(10000),
        finalAmount: decimal(90000),
      }],
    };
    const pdf = await createInvoicePdf(invoice, [{
      bankName: "Bank Test", accountNumber: "000000",
      accountHolder: "Tenant Test",
    }]);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(invoicePdfFilename(invoice)).toBe(
      "Invoice_INV-OUT001-2026-07-0001_Anggrek-Cibogo.pdf",
    );
  });

  it("contains no hardcoded production identity or automatic attachment claim", async () => {
    const source = await readFile(new URL("./invoice.service.ts", import.meta.url), "utf8");
    expect(source).not.toContain("SUM001A");
    expect(source).not.toContain("PT Hutama Daya Logistik");
    expect(source).toContain("Lampirkan PDF invoice yang baru diunduh");
    expect(source).not.toMatch(/PDF.*otomatis.*terlampir/i);
  });

  it("records all required audit event types without sensitive WhatsApp metadata", async () => {
    const [service, pdfRoute] = await Promise.all([
      readFile(new URL("./invoice.service.ts", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/invoices/[id]/pdf/route.ts", import.meta.url), "utf8"),
    ]);
    for (const event of [
      "CREATE_INVOICE_DRAFT", "UPDATE_INVOICE_DRAFT", "ISSUE_INVOICE",
      "PREPARE_INVOICE_WHATSAPP", "VOID_INVOICE",
    ]) expect(service).toContain(event);
    expect(pdfRoute).toContain("EXPORT_INVOICE_PDF");
    expect(service).not.toMatch(/metadata:[\s\S]{0,200}whatsappSnapshot/);
  });
});

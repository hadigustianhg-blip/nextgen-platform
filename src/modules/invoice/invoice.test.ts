import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  masterPickup: { findMany: vi.fn(), findFirst: vi.fn() },
  invoice: { findFirst: vi.fn(), updateMany: vi.fn() },
  outletBankAccount: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  masterPickup: { findMany: vi.fn() },
  outletBankAccount: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  invoice: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  invoiceItem: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  getInvoiceSourceItems,
  getInvoiceSourceSellers,
  createInvoiceDraft,
  createOutletBankAccount,
  getActiveOutletBankAccounts,
  getInvoice,
  invoiceJsonSafe,
  normalizeSellerName,
  normalizeWhatsappNumber,
  prepareInvoiceWhatsapp,
  sellerIdentity,
  updateOutletBankAccount,
} from "./invoice.service";
import {
  canExportInvoice,
  canIssueInvoice,
  canMutateInvoice,
  canPrepareInvoiceWhatsapp,
  canReadInvoice,
  canVoidInvoice,
} from "./invoice.authorization";
import {
  invoiceDraftSchema, invoiceRangeSchema, outletBankAccountSchema,
} from "./invoice.validation";
import { createInvoicePdf, invoicePdfFilename } from "./invoice.pdf";
import {
  buildSenderDetailUrl,
  fetchInvoiceRecipientDetail,
  fetchSelectedRecipientDetail,
  mapMiddlewareRecipient,
  representativeInvoiceWaybill,
} from "./invoice-recipient.service";

const scope = { tenantId: "tenant-1", outletId: "outlet-1" };
const session = (roles: string[]) => ({
  sessionId: "s", tenantId: "tenant-1", tenantName: "Tenant",
  userId: "user-1", userName: "User", email: "user@example.test",
  outletId: "outlet-1", outletCode: "OUT001", roles,
});

describe("Invoice recipient detail", () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: "invoice-1",
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    status: "DRAFT",
    items: [
      { waybillNumber: "" },
      { waybillNumber: "201680658475" },
      { waybillNumber: "201680658476" },
    ],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.invoice.findFirst.mockResolvedValue(invoice());
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
  });

  it("chooses the first valid ordered invoice waybill", () => {
    expect(representativeInvoiceWaybill(invoice().items)).toBe("201680658475");
    expect(representativeInvoiceWaybill([
      { waybillNumber: "ABC" },
      { waybillNumber: null },
    ])).toBeNull();
  });

  it("uses the configured environment base and encodes the waybill", () => {
    expect(buildSenderDetailUrl(
      "https://middleware.example.test/",
      "201680658475",
    )).toBe(
      "https://middleware.example.test/jfs-sender-detail?waybillNo=201680658475",
    );
    expect(buildSenderDetailUrl(
      "https://middleware.example.test",
      "201680658475 test",
    )).toContain("waybillNo=201680658475%20test");
  });

  it("validates a selected waybill in the active tenant and outlet before middleware", async () => {
    db.masterPickup.findFirst.mockResolvedValueOnce(pickup({
      waybillNo: "201680658475",
    }));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        senderName: "Recipient",
        senderMobilePhone: "08123456789",
        senderCityName: "Bandung",
        internalField: "do-not-expose",
      },
    }), { status: 200 }));
    const result = await fetchSelectedRecipientDetail(scope, "201680658475", {
      fetcher,
      baseUrl: "https://middleware.example.test",
    });
    expect(db.masterPickup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        waybillNo: "201680658475",
        tenantId: scope.tenantId,
        outletId: scope.outletId,
      },
    }));
    expect(result).toEqual({
      waybillNo: "201680658475",
      recipientName: "Recipient",
      recipientPhone: "08123456789",
      recipientCity: "Bandung",
    });
    expect(JSON.stringify(result)).not.toContain("internalField");
  });

  it("rejects a selected waybill outside the active tenant or outlet", async () => {
    db.masterPickup.findFirst.mockResolvedValueOnce(null);
    const fetcher = vi.fn();
    await expect(fetchSelectedRecipientDetail(scope, "201680658475", {
      fetcher,
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({ code: "WAYBILL_NOT_ACCESSIBLE", status: 404 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps middleware fields, stores a scoped snapshot and returns no raw data", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        senderName: "  Recipient Test ",
        senderMobilePhone: " 087777376950 ",
        senderCityName: " Kab. Test ",
        internalId: "DO_NOT_EXPOSE",
      },
    }), { status: 200 }));
    const result = await fetchInvoiceRecipientDetail(scope, "invoice-1", {
      fetcher,
      baseUrl: "https://middleware.example.test",
    });

    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "invoice-1", ...scope },
    }));
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "invoice-1", ...scope, status: "DRAFT" },
      data: {
        recipientName: "Recipient Test",
        recipientPhone: "087777376950",
        recipientCity: "Kab. Test",
      },
    });
    expect(result).toEqual({
      waybillNo: "201680658475",
      recipientName: "Recipient Test",
      recipientPhone: "087777376950",
      recipientCity: "Kab. Test",
    });
    expect(JSON.stringify(result)).not.toContain("DO_NOT_EXPOSE");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps missing or non-string middleware fields null", () => {
    expect(mapMiddlewareRecipient({
      senderName: "",
      senderMobilePhone: null,
      senderCityName: 123,
    })).toEqual({
      recipientName: null,
      recipientPhone: null,
      recipientCity: null,
    });
  });

  it("protects missing, cross-scope, waybill-less and read-only invoices", async () => {
    db.invoice.findFirst.mockResolvedValueOnce(null);
    await expect(fetchInvoiceRecipientDetail(scope, "missing", {
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({ code: "INVOICE_NOT_FOUND", status: 404 });

    db.invoice.findFirst.mockResolvedValueOnce(invoice({
      items: [{ waybillNumber: "INVALID" }],
    }));
    await expect(fetchInvoiceRecipientDetail(scope, "invoice-1", {
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({
      code: "INVOICE_WAYBILL_NOT_AVAILABLE",
      status: 422,
    });

    db.invoice.findFirst.mockResolvedValueOnce(invoice({ status: "ISSUED" }));
    await expect(fetchInvoiceRecipientDetail(scope, "invoice-1", {
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({ code: "INVOICE_LOCKED", status: 409 });
  });

  it.each([
    [404, "SENDER_DETAIL_NOT_FOUND", 404],
    [502, "JFS_AUTH_EXPIRED", 502],
    [502, "JFS_UPSTREAM_ERROR", 502],
    [504, "JFS_UPSTREAM_TIMEOUT", 504],
  ])("maps middleware %s %s safely", async (status, code, expectedStatus) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: { code, message: "raw middleware detail" },
    }), { status }));
    await expect(fetchInvoiceRecipientDetail(scope, "invoice-1", {
      fetcher,
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({ code, status: expectedStatus });
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("maps timeout, invalid JSON, missing environment and update races safely", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    await expect(fetchInvoiceRecipientDetail(scope, "invoice-1", {
      fetcher: vi.fn().mockRejectedValue(timeout),
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({ code: "JFS_UPSTREAM_TIMEOUT", status: 504 });

    await expect(fetchInvoiceRecipientDetail(scope, "invoice-1", {
      fetcher: vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({ code: "JFS_UPSTREAM_ERROR", status: 502 });

    await expect(fetchInvoiceRecipientDetail(scope, "invoice-1", {
      baseUrl: "",
    })).rejects.toMatchObject({
      code: "JFS_MIDDLEWARE_NOT_CONFIGURED",
      status: 500,
    });

    db.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(fetchInvoiceRecipientDetail(scope, "invoice-1", {
      fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: true,
        data: { senderName: "Recipient" },
      }), { status: 200 })),
      baseUrl: "https://middleware.example.test",
    })).rejects.toMatchObject({ code: "INVOICE_LOCKED", status: 409 });
  });
});

describe("Invoice outlet payment accounts", () => {
  it("uses an additive default-account migration with one default per outlet", async () => {
    const [schema, migration] = await Promise.all([
      readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8"),
      readFile(new URL(
        "../../../prisma/migrations/20260731000100_add_outlet_bank_account_default/migration.sql",
        import.meta.url,
      ), "utf8"),
    ]);
    expect(schema).toContain("isDefault");
    expect(migration).toContain('ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('"OutletBankAccount_one_default_per_outlet_idx"');
    expect(migration).toContain('WHERE "isDefault" = true');
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/);
  });

  it("loads only active accounts for the active tenant and outlet", async () => {
    db.outletBankAccount.findMany.mockResolvedValueOnce([]);
    await getActiveOutletBankAccounts(scope);
    expect(db.outletBankAccount.findMany).toHaveBeenCalledWith({
      where: { ...scope, isActive: true },
      orderBy: [
        { isDefault: "desc" },
        { displayOrder: "asc" },
        { bankName: "asc" },
      ],
      select: {
        id: true,
        bankName: true,
        accountNumber: true,
        accountHolder: true,
        isDefault: true,
      },
    });
  });

  it("makes the first account default and preserves leading zeroes", async () => {
    expect(outletBankAccountSchema.parse({
      bankName: " Bank Test ",
      accountNumber: " 0012 345 ",
      accountHolder: " Outlet Test ",
    })).toMatchObject({
      bankName: "Bank Test",
      accountNumber: "0012345",
      accountHolder: "Outlet Test",
    });
    db.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    tx.outletBankAccount.count.mockResolvedValueOnce(0);
    tx.outletBankAccount.create.mockImplementationOnce(async ({ data }) => ({
      id: "account-1",
      ...data,
    }));
    await createOutletBankAccount(scope, {
      bankName: " Bank Test ",
      accountNumber: " 0012 345 ",
      accountHolder: " Outlet Test ",
      isDefault: false,
    });
    expect(tx.outletBankAccount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        ...scope,
        bankName: "Bank Test",
        accountNumber: "0012345",
        accountHolder: "Outlet Test",
        isActive: true,
        isDefault: true,
        displayOrder: 0,
      },
    }));
  });

  it("changes the default account atomically within the active scope", async () => {
    db.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    tx.outletBankAccount.findFirst.mockResolvedValueOnce({
      id: "account-2",
      isDefault: false,
    });
    tx.outletBankAccount.update.mockResolvedValueOnce({
      id: "account-2",
      isDefault: true,
    });
    await updateOutletBankAccount(scope, "account-2", {
      bankName: "Bank Two",
      accountNumber: "0002",
      accountHolder: "Outlet",
      isDefault: true,
    });
    expect(tx.outletBankAccount.updateMany).toHaveBeenCalledWith({
      where: { ...scope, isDefault: true },
      data: { isDefault: false },
    });
    expect(tx.outletBankAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "account-2" },
      data: expect.objectContaining({ isDefault: true }),
    }));
  });

  it("rejects editing an account from another tenant or outlet", async () => {
    db.$transaction.mockImplementationOnce(async (callback) => callback(tx));
    tx.outletBankAccount.findFirst.mockResolvedValueOnce(null);
    await expect(updateOutletBankAccount(scope, "other", {
      bankName: "Bank",
      accountNumber: "001",
      accountHolder: "Holder",
      isDefault: false,
    })).rejects.toMatchObject({
      code: "PAYMENT_ACCOUNT_NOT_ACCESSIBLE",
      status: 404,
    });
  });
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
  tx.masterPickup.findMany.mockResolvedValue([pickup()]);
  tx.invoice.create.mockResolvedValue({ id: "invoice-1" });
  tx.invoice.update.mockResolvedValue({ id: "invoice-1" });
  tx.invoiceItem.createMany.mockResolvedValue({ count: 1 });
  tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  tx.invoice.findUniqueOrThrow.mockResolvedValue({ id: "invoice-1" });
  db.$transaction.mockImplementation(async (callback) => callback(tx));
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
  it("loads invoice detail within tenant/outlet scope and maps JSON-unsafe values", async () => {
    db.invoice.findFirst.mockResolvedValue({ id: "invoice-1" });
    await getInvoice(scope, "invoice-1");
    expect(db.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "invoice-1", ...scope },
    }));
    expect(invoiceJsonSafe({
      amount: decimal("90000.50"),
      createdAt: new Date("2026-07-30T00:00:00.000Z"),
      auditId: 12n,
    })).toEqual({
      amount: "90000.5",
      createdAt: "2026-07-30T00:00:00.000Z",
      auditId: "12",
    });
  });

  it("returns specific WhatsApp errors for draft, missing, and invalid numbers", async () => {
    const context = {
      ...scope,
      actorId: "33333333-3333-4333-8333-333333333333",
      outletCode: "OUT001",
    };
    tx.invoice.findFirst.mockResolvedValueOnce({
      status: "DRAFT",
      whatsappSnapshot: "081234567890",
    });
    await expect(prepareInvoiceWhatsapp(context, "invoice-1"))
      .rejects.toMatchObject({ code: "INVOICE_NOT_ISSUED", status: 409 });
    tx.invoice.findFirst.mockResolvedValueOnce({
      status: "ISSUED",
      whatsappSnapshot: null,
    });
    await expect(prepareInvoiceWhatsapp(context, "invoice-1"))
      .rejects.toMatchObject({ code: "WHATSAPP_NUMBER_REQUIRED", status: 400 });
    tx.invoice.findFirst.mockResolvedValueOnce({
      status: "ISSUED",
      whatsappSnapshot: "123",
    });
    await expect(prepareInvoiceWhatsapp(context, "invoice-1"))
      .rejects.toMatchObject({ code: "WHATSAPP_NUMBER_INVALID", status: 400 });
  });

  it("retries a serializable transaction conflict once", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "Transaction conflict",
      { code: "P2034", clientVersion: "6.19.3" },
    );
    db.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback) => callback(tx));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(createInvoiceDraft({
      ...scope,
      actorId: "33333333-3333-4333-8333-333333333333",
      outletCode: "OUT001",
      requestId: "request-1",
    }, {
      customerKey: "name:anggrek cibogo",
      customerName: "Anggrek Cibogo",
      invoiceDate: "2026-07-30",
      dueDate: "2026-08-06",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-30",
      itemIds: ["11111111-1111-4111-8111-111111111111"],
    })).resolves.toEqual({ id: "invoice-1" });

    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledWith(
      "[invoice.create.failed]",
      expect.objectContaining({
        requestId: "request-1",
        step: "transaction_started",
        attempt: 1,
        code: "P2034",
      }),
    );
    errorLog.mockRestore();
    infoLog.mockRestore();
  });

  it("does not leak service context fields into InvoiceItem.createMany", async () => {
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await createInvoiceDraft({
      ...scope,
      actorId: "33333333-3333-4333-8333-333333333333",
      outletCode: "OUT001",
      requestId: "request-2",
    }, {
      customerKey: "name:anggrek cibogo",
      customerName: "Anggrek Cibogo",
      invoiceDate: "2026-07-30",
      dueDate: "2026-08-06",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-30",
      itemIds: ["11111111-1111-4111-8111-111111111111"],
    });

    const item = tx.invoiceItem.createMany.mock.calls[0][0].data[0];
    expect(item).toMatchObject({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      invoiceId: "invoice-1",
      masterPickupId: "11111111-1111-4111-8111-111111111111",
    });
    expect(item).not.toHaveProperty("actorId");
    expect(item).not.toHaveProperty("outletCode");
    expect(item).not.toHaveProperty("requestId");
    infoLog.mockRestore();
  });

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
    expect(service).toContain("INVOICE_SOURCE_CHANGED");
  });

  it("stores recipient fields and a scoped outlet payment-account snapshot", async () => {
    const service = await readFile(new URL("./invoice.service.ts", import.meta.url), "utf8");
    for (const field of [
      "companyNameSnapshot",
      "emailSnapshot",
      "addressSnapshot",
      "paymentAccountSnapshot",
      "notes",
    ]) expect(service).toContain(field);
    expect(invoiceDraftSchema.parse({
      customerKey: "name:test",
      customerName: "Customer",
      companyName: "  Company Test  ",
      email: "",
      address: "   ",
      recipientName: "  Recipient Test ",
      recipientPhone: " 08123456789 ",
      recipientCity: " Bandung ",
      bankAccountId: "22222222-2222-4222-8222-222222222222",
      invoiceDate: "2026-07-30",
      dueDate: "2026-08-06",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-30",
      itemIds: ["11111111-1111-4111-8111-111111111111"],
    })).toMatchObject({
      companyName: "Company Test",
      email: "",
      address: "",
      recipientName: "Recipient Test",
      recipientPhone: "08123456789",
      recipientCity: "Bandung",
      bankAccountId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("creates a structured A4 PDF with invoice rows and active bank accounts", async () => {
    const invoice = {
      status: "ISSUED",
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

  it("creates a draft PDF with null-safe fields and all stream phases", async () => {
    const phases: string[] = [];
    const invoice = {
      status: "DRAFT",
      invoiceNumber: null,
      customerNameSnapshot: "Seller",
      companyNameSnapshot: null,
      addressSnapshot: null,
      invoiceDate: new Date("2026-07-30T00:00:00.000Z"),
      dueDate: new Date("2026-08-06T00:00:00.000Z"),
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-30T00:00:00.000Z"),
      subtotal: decimal(100000),
      discountTotal: decimal(0),
      grandTotal: decimal(100000),
      notes: null,
      tenant: { name: "Tenant" },
      outlet: { code: "OUT001", name: "Outlet" },
      items: [{
        transactionDate: new Date("2026-07-20T00:00:00.000Z"),
        waybillNumber: "WB001",
        pickupStaff: null,
        sellerNameSnapshot: "Seller",
        weight: decimal(1),
        freightAmount: decimal(100000),
        discountAmount: decimal(0),
        finalAmount: decimal(100000),
      }],
    };
    const pdf = await createInvoicePdf(invoice, [], {
      onPhase: (phase) => phases.push(phase),
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(phases).toEqual([
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
    ]);
    expect(invoicePdfFilename(invoice)).toBe("Invoice_DRAFT_Seller.pdf");
    const source = await readFile(new URL("./invoice.pdf.ts", import.meta.url), "utf8");
    expect(source).toContain('status === "DRAFT" ? "DRAFT"');
    expect(source).not.toMatch(/registerFont|readFileSync|document\.image/);
    const nextConfig = await readFile(
      new URL("../../../next.config.ts", import.meta.url),
      "utf8",
    );
    expect(nextConfig).toContain('serverExternalPackages: ["pdfkit"]');
  });

  it("implements the tenant layout, status watermarks and safe layout helpers", async () => {
    const source = await readFile(new URL("./invoice.pdf.ts", import.meta.url), "utf8");
    for (const helper of [
      "drawTextSafe", "drawKeyValue", "drawSummaryBox", "drawTableHeader",
      "drawTableRow", "ensurePageSpace", "drawPaymentAccounts", "drawFooter",
    ]) expect(source).toContain(`function ${helper}`);
    for (const label of [
      "DITAGIHKAN KEPADA", "NOMOR INVOICE", "TANGGAL INVOICE",
      "JATUH TEMPO", "TOTAL TAGIHAN", "INFORMASI PEMBAYARAN",
      "Nomor Rekening:", "Atas Nama:",
      "Informasi rekening pembayaran belum tersedia.",
      "Invoice ini dibuat secara elektronik dan tidak memerlukan tanda tangan.",
      "Halaman ${pageNumber} dari ${pageCount}",
    ]) expect(source).toContain(label);
    expect(source).toContain('status === "VOID" ? "VOID"');
    expect(source).toContain("invoice.outlet.name");
    expect(source).toContain("invoice.outlet.code");
    expect(source).toContain("invoice.tenant.name");
    expect(source).toContain("invoice.recipientName");
    expect(source).toContain("invoice.recipientPhone");
    expect(source).toContain("invoice.recipientCity");
    expect(source).not.toMatch(/NEXTGEN|J&T CARGO SUM001A|PT HUTAMA DAYA LOGISTIK/i);
    expect(source).not.toMatch(/registerFont|readFileSync|\/ROOT\/|node_modules\/pdfkit\/js\/data/);
    const fontNames = [...source.matchAll(/\.font\("([^"]+)"\)/g)]
      .map((match) => match[1]);
    expect(new Set(fontNames)).toEqual(new Set(["Helvetica", "Helvetica-Bold"]));
  });

  it("keeps tenant identity dynamic and produces multi-page tables in order", async () => {
    const item = {
      transactionDate: new Date("2026-07-20T00:00:00.000Z"),
      waybillNumber: "570500000001",
      pickupStaff: null,
      sellerNameSnapshot: "Pengirim dengan nama panjang untuk menguji wrap",
      weight: decimal("2.5"),
      freightAmount: decimal(100000),
      discountAmount: decimal(10000),
      finalAmount: decimal(90000),
    };
    const base = {
      status: "ISSUED",
      invoiceNumber: "INV/OUT001/2026/07/0001",
      customerNameSnapshot: "Customer Test",
      companyNameSnapshot: null,
      whatsappSnapshot: null,
      emailSnapshot: null,
      addressSnapshot: null,
      invoiceDate: new Date("2026-07-30T00:00:00.000Z"),
      dueDate: new Date("2026-08-06T00:00:00.000Z"),
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-30T00:00:00.000Z"),
      subtotal: decimal(5_000_000),
      discountTotal: decimal(500_000),
      grandTotal: decimal(4_500_000),
      notes: null,
      items: Array.from({ length: 50 }, (_, index) => ({
        ...item,
        waybillNumber: String(570500000001 + index),
      })),
    };
    const first = await createInvoicePdf({
      ...base,
      tenant: { name: "Tenant Alpha" },
      outlet: { code: "ALPHA01", name: "Outlet Alpha" },
    }, []);
    const second = await createInvoicePdf({
      ...base,
      tenant: { name: "Tenant Beta" },
      outlet: { code: "BETA01", name: "Outlet Beta" },
    }, []);
    const pageCount = (first.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
    expect(first.equals(second)).toBe(false);
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

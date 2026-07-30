import "server-only";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  calculatePickupFinancials,
  isCashSettlement,
} from "@/modules/pickup/pickup-settlement.service";

type Scope = { tenantId: string; outletId: string };
type Context = Scope & {
  actorId: string;
  outletCode: string;
  requestId?: string;
};
type DraftInput = {
  customerKey: string;
  customerName: string;
  companyName?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  invoiceDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
  itemIds: string[];
};

const zero = () => new Prisma.Decimal(0);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  "DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID",
];

export class InvoiceServiceError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public details?: string[],
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

type CreateInvoiceStep =
  | "transaction_started"
  | "sources_validated"
  | "invoice_created"
  | "invoice_items_created"
  | "audit_log_created"
  | "invoice_loaded"
  | "transaction_committed";

function logCreateInvoice(
  context: Context,
  step: CreateInvoiceStep,
  metadata: Record<string, unknown> = {},
) {
  console.info("[invoice.create]", {
    requestId: context.requestId ?? "unknown",
    step,
    ...metadata,
  });
}

function prismaErrorDetails(error: unknown) {
  const candidate = error as {
    name?: string;
    code?: string;
    message?: string;
    stack?: string;
    meta?: unknown;
  };
  return {
    name: candidate?.name ?? "UnknownError",
    code: candidate?.code ?? null,
    message: candidate?.message ?? String(error),
    stack: candidate?.stack ?? null,
    meta: candidate?.meta ?? null,
  };
}

function logCreateInvoiceError(
  context: Context,
  step: CreateInvoiceStep,
  attempt: number,
  error: unknown,
) {
  console.error("[invoice.create.failed]", {
    requestId: context.requestId ?? "unknown",
    step,
    attempt,
    ...prismaErrorDetails(error),
  });
}

export function normalizeSellerName(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function sellerIdentity(input: {
  id: string;
  waybillNo: string;
  sellerName?: string | null;
}) {
  const name = normalizeSellerName(input.sellerName);
  return {
    customerKey: name
      ? `name:${name.toLocaleLowerCase("id-ID")}`
      : `waybill:${input.waybillNo || input.id}`,
    customerName: name || "Tanpa Nama Seller",
  };
}

const invoiceSourceInclude = {
  rawPickup: {
    select: {
      settlementRaw: true,
      senderName: true,
      receiverAddress: true,
      weight: true,
    },
  },
  settlementRevisions: {
    where: { recordStatus: "VALID" as const },
    orderBy: { revision: "desc" as const },
    take: 1,
    select: { id: true, discountAmount: true, reason: true },
  },
  payments: {
    where: { recordStatus: "VALID" as const },
    select: {
      receivedAmount: true,
      paymentMethodRaw: true,
      transferAccount: true,
    },
  },
  invoiceItems: {
    where: { invoice: { status: { in: ACTIVE_INVOICE_STATUSES } } },
    select: {
      invoiceId: true,
      invoice: { select: { status: true, invoiceNumber: true } },
    },
  },
};

function mapSource(row: Prisma.MasterPickupGetPayload<{
  include: typeof invoiceSourceInclude;
}>) {
  if (!isCashSettlement(row.rawPickup.settlementRaw)) return null;
  const financial = calculatePickupFinancials(row);
  if (!financial.remainingAmount.greaterThan(0)) return null;
  const seller = sellerIdentity({
    id: row.id,
    waybillNo: row.waybillNo,
    sellerName: row.senderName ?? row.rawPickup.senderName,
  });
  const lock = row.invoiceItems[0];
  if (lock && lock.invoice.status !== "DRAFT") return null;
  return {
    id: row.id,
    pickupSettlementRevisionId: row.settlementRevisions[0]?.id ?? null,
    customerKey: seller.customerKey,
    sellerName: seller.customerName,
    companyName: null,
    address: row.rawPickup.receiverAddress,
    whatsapp: null,
    email: null,
    paymentTermDays: null,
    transactionDate: row.operationalDate.toISOString().slice(0, 10),
    waybillNumber: row.waybillNo,
    pickupStaff: row.staffName,
    weight: row.rawPickup.weight.toString(),
    freightAmount: row.freightAmount.toString(),
    discountAmount: financial.discountAmount.toString(),
    finalAmount: financial.finalObligation.toString(),
    obligationAmount: financial.remainingAmount.toString(),
    draftInvoiceId: lock?.invoiceId ?? null,
    draftInvoiceNumber: lock?.invoice.invoiceNumber ?? null,
    selectable: !lock,
  };
}

export async function getInvoiceSourceItems(input: Scope & {
  startDate: string;
  endDate: string;
  seller?: string;
  waybill?: string;
  customerKey?: string;
  invoiceId?: string;
}) {
  const rows = await prisma.masterPickup.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      operationalDate: { gte: date(input.startDate), lte: date(input.endDate) },
      ...(input.waybill
        ? { waybillNo: { contains: input.waybill, mode: "insensitive" } }
        : {}),
    },
    include: invoiceSourceInclude,
    orderBy: [{ operationalDate: "asc" }, { waybillNo: "asc" }],
  });
  return rows
    .map(mapSource)
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => !input.seller ||
      row.sellerName.toLocaleLowerCase("id-ID").includes(
        input.seller.toLocaleLowerCase("id-ID"),
      ))
    .filter((row) => !input.customerKey || row.customerKey === input.customerKey)
    .map((row) => row.draftInvoiceId === input.invoiceId
      ? { ...row, selectable: true }
      : row);
}

export async function getInvoiceSourceSellers(input: Scope & {
  startDate: string;
  endDate: string;
  seller?: string;
  waybill?: string;
}) {
  const rows = await getInvoiceSourceItems(input);
  const groups = new Map<string, {
    customerKey: string;
    customerName: string;
    itemCount: number;
    totalOutstanding: Prisma.Decimal;
    oldestDate: string;
    newestDate: string;
    draftCount: number;
  }>();
  for (const row of rows) {
    const current = groups.get(row.customerKey) ?? {
      customerKey: row.customerKey,
      customerName: row.sellerName,
      itemCount: 0,
      totalOutstanding: zero(),
      oldestDate: row.transactionDate,
      newestDate: row.transactionDate,
      draftCount: 0,
    };
    current.itemCount += 1;
    current.totalOutstanding = current.totalOutstanding.plus(row.obligationAmount);
    current.oldestDate = current.oldestDate < row.transactionDate
      ? current.oldestDate : row.transactionDate;
    current.newestDate = current.newestDate > row.transactionDate
      ? current.newestDate : row.transactionDate;
    if (row.draftInvoiceId) current.draftCount += 1;
    groups.set(row.customerKey, current);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalOutstanding: group.totalOutstanding.toString(),
    }))
    .sort((left, right) =>
      new Prisma.Decimal(right.totalOutstanding)
        .comparedTo(new Prisma.Decimal(left.totalOutstanding)) ||
      left.customerName.localeCompare(right.customerName, "id-ID"));
}

async function validatedSources(
  tx: Prisma.TransactionClient,
  scope: Scope,
  itemIds: string[],
  allowedInvoiceId?: string,
) {
  const rows = await tx.masterPickup.findMany({
    where: {
      id: { in: [...new Set(itemIds)] },
      tenantId: scope.tenantId,
      outletId: scope.outletId,
    },
    include: invoiceSourceInclude,
  });
  if (rows.length !== new Set(itemIds).size) {
    throw new InvoiceServiceError("SOURCE_ITEM_NOT_ELIGIBLE");
  }
  const sources = rows.map((row) => {
    if (!isCashSettlement(row.rawPickup.settlementRaw)) {
      throw new InvoiceServiceError("SOURCE_ITEM_NOT_ELIGIBLE");
    }
    const financial = calculatePickupFinancials(row);
    if (!financial.remainingAmount.greaterThan(0)) {
      throw new InvoiceServiceError("SOURCE_ALREADY_PAID", 409, [row.waybillNo]);
    }
    const conflict = row.invoiceItems.find((item) => item.invoiceId !== allowedInvoiceId);
    if (conflict) {
      throw new InvoiceServiceError("INVOICE_ITEM_LOCKED", 409, [row.waybillNo]);
    }
    return { row, financial, seller: sellerIdentity({
      id: row.id,
      waybillNo: row.waybillNo,
      sellerName: row.senderName ?? row.rawPickup.senderName,
    }) };
  });
  return sources;
}

function totals(sources: Awaited<ReturnType<typeof validatedSources>>) {
  return sources.reduce((result, { row, financial }) => ({
    subtotal: result.subtotal.plus(row.freightAmount),
    discountTotal: result.discountTotal.plus(financial.discountAmount),
    grandTotal: result.grandTotal.plus(financial.remainingAmount),
  }), { subtotal: zero(), discountTotal: zero(), grandTotal: zero() });
}

function itemData(
  context: Scope,
  invoiceId: string,
  source: Awaited<ReturnType<typeof validatedSources>>[number],
) {
  const { row, financial, seller } = source;
  return {
    ...context,
    invoiceId,
    masterPickupId: row.id,
    pickupSettlementRevisionId: row.settlementRevisions[0]?.id ?? null,
    activeLockKey: `${context.tenantId}:${context.outletId}:${row.id}`,
    waybillNumber: row.waybillNo,
    transactionDate: row.operationalDate,
    pickupStaff: row.staffName,
    sellerNameSnapshot: seller.customerName,
    weight: row.rawPickup.weight,
    freightAmount: row.freightAmount,
    discountAmount: financial.discountAmount,
    finalAmount: financial.finalObligation,
    obligationAmount: financial.remainingAmount,
    description: row.settlementRevisions[0]?.reason ?? null,
  };
}

const invoiceInclude = {
  items: { orderBy: [{ transactionDate: "asc" as const }, { waybillNumber: "asc" as const }] },
  outlet: { select: { code: true, name: true } },
  tenant: { select: { name: true } },
  createdBy: { select: { name: true } },
};

export async function createInvoiceDraft(context: Context, input: DraftInput) {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let step: CreateInvoiceStep = "transaction_started";
    try {
      logCreateInvoice(context, step, {
        attempt,
        sellerKey: input.customerKey,
        itemCount: input.itemIds.length,
      });
      const result = await prisma.$transaction(async (tx) => {
        const sources = await validatedSources(tx, context, input.itemIds);
        step = "sources_validated";
        if (sources.some((source) => source.seller.customerKey !== input.customerKey)) {
          throw new InvoiceServiceError("SOURCE_SELLER_MISMATCH");
        }
        const calculated = totals(sources);
        logCreateInvoice(context, step, {
          attempt,
          itemCount: sources.length,
          subtotal: calculated.subtotal.toString(),
          grandTotal: calculated.grandTotal.toString(),
        });
        const invoice = await tx.invoice.create({
          data: {
            tenantId: context.tenantId,
            outletId: context.outletId,
            customerKey: input.customerKey,
            customerNameSnapshot: input.customerName,
            companyNameSnapshot: input.companyName || null,
            whatsappSnapshot: input.whatsapp || null,
            emailSnapshot: input.email || null,
            addressSnapshot: input.address || null,
            invoiceDate: date(input.invoiceDate),
            dueDate: date(input.dueDate),
            periodStart: date(input.periodStart),
            periodEnd: date(input.periodEnd),
            ...calculated,
            notes: input.notes || null,
            createdByUserId: context.actorId,
          },
        });
        step = "invoice_created";
        logCreateInvoice(context, step, { attempt, invoiceId: invoice.id });
        await tx.invoiceItem.createMany({
          data: sources.map((source) => itemData(context, invoice.id, source)),
        });
        step = "invoice_items_created";
        logCreateInvoice(context, step, {
          attempt,
          invoiceId: invoice.id,
          itemCount: sources.length,
        });
        await tx.auditLog.create({ data: {
          tenantId: context.tenantId, outletId: context.outletId,
          actorId: context.actorId, action: "CREATE",
          entityType: "CREATE_INVOICE_DRAFT", entityId: invoice.id,
          metadata: {
            customerKey: input.customerKey,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            itemCount: sources.length,
            grandTotal: calculated.grandTotal.toString(),
            result: "SUCCESS",
          },
        } });
        step = "audit_log_created";
        logCreateInvoice(context, step, { attempt, invoiceId: invoice.id });
        const created = await tx.invoice.findUniqueOrThrow({
          where: { id: invoice.id },
          include: invoiceInclude,
        });
        step = "invoice_loaded";
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      step = "transaction_committed";
      logCreateInvoice(context, step, { attempt, invoiceId: result.id });
      return result;
    } catch (error) {
      logCreateInvoiceError(context, step, attempt, error);
      if (error instanceof InvoiceServiceError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < maxAttempts
      ) {
        continue;
      }
      if ((error as { code?: string })?.code === "P2021") {
        throw new InvoiceServiceError("DATABASE_MIGRATION_REQUIRED", 503, undefined, {
          cause: error,
        });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new InvoiceServiceError("INVOICE_ITEM_LOCKED", 409, undefined, {
          cause: error,
        });
      }
      throw new InvoiceServiceError("INVOICE_CREATE_FAILED", 500, undefined, {
        cause: error,
      });
    }
  }
  throw new InvoiceServiceError("INVOICE_CREATE_FAILED", 500);
}

export async function updateInvoiceDraft(
  context: Context,
  invoiceId: string,
  input: DraftInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId: context.tenantId, outletId: context.outletId },
      });
      if (!existing) throw new InvoiceServiceError("INVOICE_NOT_FOUND", 404);
      if (existing.status !== "DRAFT") throw new InvoiceServiceError("INVOICE_LOCKED", 409);
      const sources = await validatedSources(tx, context, input.itemIds, invoiceId);
      if (sources.some((source) => source.seller.customerKey !== input.customerKey)) {
        throw new InvoiceServiceError("SOURCE_SELLER_MISMATCH");
      }
      const calculated = totals(sources);
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          customerKey: input.customerKey,
          customerNameSnapshot: input.customerName,
          companyNameSnapshot: input.companyName || null,
          whatsappSnapshot: input.whatsapp || null,
          emailSnapshot: input.email || null,
          addressSnapshot: input.address || null,
          invoiceDate: date(input.invoiceDate),
          dueDate: date(input.dueDate),
          periodStart: date(input.periodStart),
          periodEnd: date(input.periodEnd),
          ...calculated,
          notes: input.notes || null,
        },
      });
      await tx.invoiceItem.createMany({
        data: sources.map((source) => itemData(context, invoiceId, source)),
      });
      await tx.auditLog.create({ data: {
        tenantId: context.tenantId, outletId: context.outletId,
        actorId: context.actorId, action: "UPDATE",
        entityType: "UPDATE_INVOICE_DRAFT", entityId: invoiceId,
        metadata: {
          customerKey: input.customerKey,
          itemCount: sources.length,
          grandTotal: calculated.grandTotal.toString(),
          result: "SUCCESS",
        },
      } });
      return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InvoiceServiceError) throw error;
    if ((error as { code?: string })?.code === "P2021") {
      throw new InvoiceServiceError("DATABASE_MIGRATION_REQUIRED", 503);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InvoiceServiceError("INVOICE_ITEM_LOCKED", 409);
    }
    throw new InvoiceServiceError("INVOICE_SAVE_FAILED", 500);
  }
}

export async function issueInvoice(context: Context, invoiceId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId: context.tenantId, outletId: context.outletId },
        include: { items: true },
      });
      if (!invoice) throw new InvoiceServiceError("INVOICE_NOT_FOUND", 404);
      if (invoice.status !== "DRAFT") throw new InvoiceServiceError("INVOICE_LOCKED", 409);
      const sources = await validatedSources(
        tx, context, invoice.items.map((item) => item.masterPickupId), invoiceId,
      );
      const changed = sources.filter(({ row, financial }) => {
        const snapshot = invoice.items.find((item) => item.masterPickupId === row.id);
        return !snapshot ||
          !snapshot.freightAmount.equals(row.freightAmount) ||
          !snapshot.discountAmount.equals(financial.discountAmount) ||
          !snapshot.obligationAmount.equals(financial.remainingAmount);
      });
      if (changed.length) {
        throw new InvoiceServiceError(
          "INVOICE_SOURCE_CHANGED", 409, changed.map(({ row }) => row.waybillNo),
        );
      }
      const year = invoice.invoiceDate.getUTCFullYear();
      const month = invoice.invoiceDate.getUTCMonth() + 1;
      const sequence = await tx.invoiceSequence.upsert({
        where: {
          tenantId_outletId_year_month: {
            tenantId: context.tenantId,
            outletId: context.outletId,
            year,
            month,
          },
        },
        create: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          year,
          month,
          lastValue: 1,
        },
        update: { lastValue: { increment: 1 } },
      });
      const outletCode = context.outletCode.replace(/[^A-Za-z0-9-]/g, "-");
      const invoiceNumber = [
        "INV", outletCode, String(year), String(month).padStart(2, "0"),
        String(sequence.lastValue).padStart(4, "0"),
      ].join("/");
      const issued = await tx.invoice.update({
        where: { id: invoiceId },
        data: { invoiceNumber, status: "ISSUED", issuedAt: new Date() },
        include: invoiceInclude,
      });
      await tx.auditLog.create({ data: {
        tenantId: context.tenantId, outletId: context.outletId,
        actorId: context.actorId, action: "UPDATE",
        entityType: "ISSUE_INVOICE", entityId: invoiceId,
        metadata: {
          invoiceNumber,
          customerKey: invoice.customerKey,
          itemCount: invoice.items.length,
          grandTotal: invoice.grandTotal.toString(),
          result: "SUCCESS",
        },
      } });
      return issued;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof InvoiceServiceError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)) {
      throw new InvoiceServiceError("INVOICE_CONFLICT", 409);
    }
    throw new InvoiceServiceError("INVOICE_ISSUE_FAILED", 500);
  }
}

export async function getInvoice(scope: Scope, invoiceId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, ...scope },
    include: invoiceInclude,
  });
}

export async function listInvoices(input: Scope & {
  search?: string;
  status?: InvoiceStatus | "";
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.InvoiceWhereInput = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.startDate || input.endDate ? { invoiceDate: {
      ...(input.startDate ? { gte: date(input.startDate) } : {}),
      ...(input.endDate ? { lte: date(input.endDate) } : {}),
    } } : {}),
    ...(input.search ? { OR: [
      { invoiceNumber: { contains: input.search, mode: "insensitive" } },
      { customerNameSnapshot: { contains: input.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);
  return {
    data: rows,
    pagination: {
      page: input.page, pageSize: input.pageSize, total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function voidInvoice(
  context: Context,
  invoiceId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, tenantId: context.tenantId, outletId: context.outletId },
    });
    if (!invoice) throw new InvoiceServiceError("INVOICE_NOT_FOUND", 404);
    if (["PAID", "VOID", "CANCELLED"].includes(invoice.status)) {
      throw new InvoiceServiceError("INVOICE_LOCKED", 409);
    }
    await tx.invoiceItem.updateMany({
      where: { invoiceId },
      data: { activeLockKey: null },
    });
    const result = await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "VOID", voidedAt: new Date(), notes: reason },
      include: invoiceInclude,
    });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId,
      actorId: context.actorId, action: "UPDATE",
      entityType: "VOID_INVOICE", entityId: invoiceId,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        customerKey: invoice.customerKey,
        result: "SUCCESS",
      },
    } });
    return result;
  });
}

export function normalizeWhatsappNumber(value: string | null | undefined) {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  const normalized = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits;
  return /^628\d{8,11}$/.test(normalized) ? normalized : null;
}

export async function prepareInvoiceWhatsapp(context: Context, invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: {
        id: invoiceId, tenantId: context.tenantId, outletId: context.outletId,
        status: { in: ["ISSUED", "SENT"] },
      },
      include: { _count: { select: { items: true } }, outlet: true, tenant: true },
    });
    if (!invoice) throw new InvoiceServiceError("INVOICE_NOT_READY", 409);
    const phone = normalizeWhatsappNumber(invoice.whatsappSnapshot);
    if (!phone) throw new InvoiceServiceError("WHATSAPP_INVALID");
    const formatDate = (value: Date) =>
      new Intl.DateTimeFormat("id-ID", {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      }).format(value);
    const money = new Intl.NumberFormat("id-ID", {
      style: "currency", currency: "IDR", maximumFractionDigits: 0,
    }).format(Number(invoice.grandTotal));
    const message = [
      `Yth. Bapak/Ibu ${invoice.customerNameSnapshot},`,
      "",
      `Berikut tagihan pengiriman periode ${formatDate(invoice.periodStart)} sampai ${formatDate(invoice.periodEnd)}.`,
      "",
      `Nomor Invoice:\n${invoice.invoiceNumber}`,
      "",
      `Jumlah Resi:\n${invoice._count.items} resi`,
      "",
      `Total Tagihan:\n${money}`,
      "",
      `Jatuh Tempo:\n${formatDate(invoice.dueDate)}`,
      "",
      "PDF invoice telah disiapkan untuk dilampirkan.",
      "",
      `Terima kasih.\n${invoice.outlet.name}\n${invoice.tenant.name}`,
    ].join("\n");
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "SENT", sentAt: invoice.sentAt ?? new Date() },
    });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId, outletId: context.outletId,
      actorId: context.actorId, action: "UPDATE",
      entityType: "PREPARE_INVOICE_WHATSAPP", entityId: invoiceId,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        customerKey: invoice.customerKey,
        itemCount: invoice._count.items,
        grandTotal: invoice.grandTotal.toString(),
        result: "SUCCESS",
      },
    } });
    return {
      url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      attachmentInstruction:
        "Lampirkan PDF invoice yang baru diunduh pada chat WhatsApp.",
    };
  });
}

export async function getActiveOutletBankAccounts(scope: Scope) {
  return prisma.outletBankAccount.findMany({
    where: { ...scope, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { bankName: "asc" }],
  });
}

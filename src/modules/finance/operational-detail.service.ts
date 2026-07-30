import "server-only";
import { prisma } from "@/lib/db/prisma";

type Scope = { tenantId: string; outletId: string };
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const whereRange = (scope: Scope, startDate: string, endDate: string) => ({
  ...scope,
  status: "VALID" as const,
  operationalDate: { gte: date(startDate), lte: date(endDate) },
});

export async function getOperationalDetailSummary(
  input: Scope & { startDate: string; endDate: string },
) {
  const rows = await prisma.operationalExpense.groupBy({
    by: ["category"],
    where: whereRange(input, input.startDate, input.endDate),
    _count: { _all: true },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });
  return {
    summary: {
      totalAmount: rows.reduce((sum, row) => sum + Number(row._sum.amount || 0), 0),
      totalTransactions: rows.reduce((sum, row) => sum + row._count._all, 0),
      totalCategories: rows.length,
    },
    categories: rows.map((row) => ({
      category: row.category,
      transactionCount: row._count._all,
      totalAmount: Number(row._sum.amount || 0),
    })),
  };
}

export async function getOperationalDetailRows(input: Scope & {
  startDate: string; endDate: string; category?: string;
  page?: number; pageSize?: number; all?: boolean;
}) {
  const where = {
    ...whereRange(input, input.startDate, input.endDate),
    ...(input.category ? { category: input.category } : {}),
  };
  const page = input.page || 1;
  const pageSize = input.pageSize || 25;
  const [rows, total] = await Promise.all([
    prisma.operationalExpense.findMany({
      where,
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ operationalDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      ...(input.all ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    }),
    prisma.operationalExpense.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      date: row.operationalDate.toISOString().slice(0, 10),
      category: row.category,
      description: row.description,
      amount: Number(row.amount),
      pic: row.createdBy.name,
      referenceNumber: row.vehiclePlate || row.id,
    })),
    pagination: {
      page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    },
  };
}

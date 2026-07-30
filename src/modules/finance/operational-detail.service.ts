import "server-only";
import { listOperationalSettlement } from "@/modules/operational-settlement";

type Scope = { tenantId: string; outletId: string };
type OperationalDetailInput = Scope & {
  startDate: string;
  endDate: string;
  category?: string;
  page?: number;
  pageSize?: number;
  all?: boolean;
};

type SettlementRow = Awaited<ReturnType<typeof listOperationalSettlement>>["data"][number];

function calendarDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function getValidManualTransactions(input: OperationalDetailInput) {
  const rows: SettlementRow[] = [];
  for (const operationalDate of calendarDates(input.startDate, input.endDate)) {
    let page = 1;
    let totalPages = 1;
    do {
      const result = await listOperationalSettlement({
        tenantId: input.tenantId,
        outletId: input.outletId,
        operationalDate,
        category: input.category,
        page,
        pageSize: 100,
      });
      rows.push(...result.data.filter((row) => row.status === "VALID"));
      totalPages = result.pagination.totalPages;
      page += 1;
    } while (page <= totalPages);
  }
  return rows;
}

export async function getOperationalDetailSummary(
  input: Scope & { startDate: string; endDate: string },
) {
  const transactions = await getValidManualTransactions(input);
  const grouped = new Map<string, { transactionCount: number; totalAmount: number }>();
  for (const row of transactions) {
    const current = grouped.get(row.category) ?? { transactionCount: 0, totalAmount: 0 };
    current.transactionCount += 1;
    current.totalAmount += Number(row.amount);
    grouped.set(row.category, current);
  }
  const categories = [...grouped.entries()]
    .map(([category, values]) => ({ category, ...values }))
    .sort((left, right) => right.totalAmount - left.totalAmount);
  return {
    summary: {
      totalAmount: categories.reduce((sum, row) => sum + row.totalAmount, 0),
      totalTransactions: transactions.length,
      totalCategories: categories.length,
    },
    categories,
  };
}

export async function getOperationalDetailRows(input: OperationalDetailInput) {
  const transactions = await getValidManualTransactions(input);
  const sorted = transactions.sort((left, right) => {
    const byDate = right.operationalDate.getTime() - left.operationalDate.getTime();
    if (byDate !== 0) return byDate;
    const byCreatedAt = right.createdAt.getTime() - left.createdAt.getTime();
    return byCreatedAt !== 0 ? byCreatedAt : right.id.localeCompare(left.id);
  });
  const page = input.page || 1;
  const pageSize = input.pageSize || 25;
  const selected = input.all
    ? sorted
    : sorted.slice((page - 1) * pageSize, page * pageSize);

  return {
    data: selected.map((row) => ({
      id: row.id,
      date: row.operationalDate.toISOString().slice(0, 10),
      category: row.category,
      description: row.description,
      amount: Number(row.amount),
      pic: row.createdBy,
      referenceNumber: row.vehiclePlate || row.id,
    })),
    pagination: {
      page,
      pageSize,
      total: sorted.length,
      totalPages: Math.ceil(sorted.length / pageSize),
    },
  };
}

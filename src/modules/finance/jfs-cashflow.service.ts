import "server-only";

const BASE_URL = "https://jfs-middleware-v2-production.up.railway.app";

type Direction = "income" | "expense";
type IbkRecord = {
  date: string;
  direction: Direction;
  transactionType: string;
  amount: number;
};

export class JfsCashflowError extends Error {
  constructor(public readonly code: "SOURCE_UNAVAILABLE" | "INVALID_RESPONSE") {
    super(code);
  }
}

function direction(value: unknown): Direction | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (value === 1 || ["1", "income", "credit", "kredit", "pemasukan"].includes(normalized)) return "income";
  if (value === 2 || ["2", "expense", "debit", "pengeluaran"].includes(normalized)) return "expense";
  return null;
}

export function normalizeIbkRecord(value: unknown): IbkRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const recordDirection = direction(raw.tradeType);
  const amount = Number(raw.amount);
  const date = typeof raw.date === "string" ? raw.date.trim().slice(0, 10) : "";
  if (!recordDirection || !Number.isFinite(amount) || !date) return null;
  return {
    date,
    direction: recordDirection,
    transactionType:
      (typeof raw.feeItemTypeName === "string" && raw.feeItemTypeName.trim())
      || (typeof raw.feeTypeName === "string" && raw.feeTypeName.trim())
      || "Lainnya",
    amount: Math.abs(amount),
  };
}

function summarize(records: IbkRecord[], directionValue: Direction) {
  const totals = new Map<string, number>();
  for (const record of records) {
    if (record.direction !== directionValue) continue;
    totals.set(record.transactionType, (totals.get(record.transactionType) || 0) + record.amount);
  }
  return [...totals.entries()]
    .map(([transactionType, total]) => ({ transactionType, total }))
    .sort((a, b) => b.total - a.total);
}

export async function fetchJfsCashflow(input: {
  startDate: string;
  endDate: string;
  fetcher?: typeof fetch;
}) {
  const url = new URL("/jfs-ibk-report", process.env.JFS_MIDDLEWARE_URL || BASE_URL);
  url.searchParams.set("startDate", input.startDate);
  url.searchParams.set("endDate", input.endDate);
  let response: Response;
  try {
    response = await (input.fetcher || fetch)(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new JfsCashflowError("SOURCE_UNAVAILABLE");
  }
  const body = await response.json().catch(() => null) as
    | { success?: boolean; data?: unknown[] }
    | null;
  if (!response.ok) throw new JfsCashflowError("SOURCE_UNAVAILABLE");
  if (body?.success !== true || !Array.isArray(body.data)) {
    throw new JfsCashflowError("INVALID_RESPONSE");
  }
  const records = body.data
    .map(normalizeIbkRecord)
    .filter((record): record is IbkRecord =>
      Boolean(record && record.date >= input.startDate && record.date <= input.endDate));
  const income = summarize(records, "income");
  const expense = summarize(records, "expense");
  const totalIncome = income.reduce((sum, row) => sum + row.total, 0);
  const totalExpense = expense.reduce((sum, row) => sum + row.total, 0);
  return {
    income, expense,
    summary: { totalIncome, totalExpense, difference: totalIncome - totalExpense },
    receivedAt: new Date().toISOString(),
  };
}

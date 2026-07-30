import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  fetchJfsCashflow,
  JfsCashflowError,
  normalizeIbkRecord,
} from "./jfs-cashflow.service";

describe("JFS Cashflow", () => {
  it("normalizes actual IBK fields and recognizes income/expense trade types", () => {
    expect(normalizeIbkRecord({
      tradeType: 1, feeTypeName: "Income", feeItemTypeName: "Setoran",
      date: "2026-07-30 10:00:00", amount: "100000",
    })).toEqual({
      direction: "income", transactionType: "Setoran",
      date: "2026-07-30", amount: 100000,
    });
    expect(normalizeIbkRecord({
      tradeType: 2, feeTypeName: "Biaya", date: "2026-07-30", amount: -25000,
    })).toMatchObject({ direction: "expense", transactionType: "Biaya", amount: 25000 });
  });

  it("always performs a no-store middleware request with the active range", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const parsed = url instanceof URL ? url : new URL(String(url));
      expect(parsed.pathname).toBe("/jfs-ibk-report");
      expect(parsed.searchParams.get("startDate")).toBe("2026-07-01");
      expect(parsed.searchParams.get("endDate")).toBe("2026-07-30");
      expect(init?.cache).toBe("no-store");
      return new Response(JSON.stringify({ success: true, data: [] }));
    });
    await fetchJfsCashflow({
      startDate: "2026-07-01", endDate: "2026-07-30", fetcher,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("filters by selected range, aggregates types, and calculates difference", async () => {
    const result = await fetchJfsCashflow({
      startDate: "2026-07-01", endDate: "2026-07-30",
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        success: true,
        data: [
          { tradeType: 1, feeItemTypeName: "Setoran", date: "2026-07-01", amount: 100 },
          { tradeType: 1, feeItemTypeName: "Setoran", date: "2026-07-30", amount: 50 },
          { tradeType: 2, feeItemTypeName: "Biaya", date: "2026-07-15", amount: 25 },
          { tradeType: 1, feeItemTypeName: "Outside", date: "2026-06-30", amount: 999 },
        ],
      }))),
    });
    expect(result.income).toEqual([{ transactionType: "Setoran", total: 150 }]);
    expect(result.expense).toEqual([{ transactionType: "Biaya", total: 25 }]);
    expect(result.summary).toEqual({ totalIncome: 150, totalExpense: 25, difference: 125 });
  });

  it("classifies timeout/offline and invalid source responses safely", async () => {
    await expect(fetchJfsCashflow({
      startDate: "2026-07-01", endDate: "2026-07-30",
      fetcher: vi.fn(async () => { throw new Error("secret stack"); }),
    })).rejects.toEqual(new JfsCashflowError("SOURCE_UNAVAILABLE"));
    await expect(fetchJfsCashflow({
      startDate: "2026-07-01", endDate: "2026-07-30",
      fetcher: vi.fn(async () => new Response("{}")),
    })).rejects.toEqual(new JfsCashflowError("INVALID_RESPONSE"));
  });

  it("does not request on page load and keeps check/export audit contracts", async () => {
    const [ui, checkRoute, exportRoute] = await Promise.all([
      readFile(new URL("../../components/finance/jfs-cashflow-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/cashflow-jfs/check/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../../app/api/finance/cashflow-jfs/export/route.ts", import.meta.url), "utf8"),
    ]);
    expect(ui).not.toContain("useEffect");
    expect(ui).toContain('loading ? "Checking..." : "CEK"');
    expect(ui).toContain("md:grid-cols-2");
    expect(checkRoute).toContain('entityType: "VIEW_JFS_CASHFLOW"');
    expect(exportRoute).toContain('entityType: "EXPORT_JFS_CASHFLOW"');
    expect(exportRoute).toContain("Cashflow_JFS_");
    for (const sheet of ["Summary", "Pemasukan", "Pengeluaran"]) {
      expect(exportRoute).toContain(`name: "${sheet}"`);
    }
    expect(`${checkRoute}\n${exportRoute}`).not.toMatch(/password|authtoken|cookie/i);
  });
});

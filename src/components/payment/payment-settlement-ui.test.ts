import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./payment-settlement-client.tsx", import.meta.url),
  "utf8",
);

describe("Payment Settlement period bank balance UI", () => {
  it("renders the backend period balance with unambiguous copy", () => {
    expect(source).toContain('"Saldo Bank Periode"');
    expect(source).toContain('"Saldo bersih channel bank pada periode terpilih."');
    expect(source).toContain("result?.summary.bankBalance");
    expect(source).not.toContain("Saldo berdasarkan mutasi NEXTGEN, bukan saldo realtime bank.");
    expect(source).not.toContain("dailyRows.reduce");
  });

  it("refetches when month or year changes and preserves the closing filter state", () => {
    expect(source).toContain("[month, year, outletId, closingStatus]");
    expect(source).toContain("setMonth(Number(e.target.value))");
    expect(source).toContain("setYear(Number(e.target.value))");
    expect(source).toContain("closingStatus,");
  });

  it("keeps all other cards and settlement table columns unchanged", () => {
    for (const label of [
      "Cash Operasional", "Transfer Operasional", "Pengeluaran Operasional",
      "Cash On Hand", "Pickup Belum Bayar", "Delivery Belum Clear",
      "Setor Bank Bulan Ini", "Saldo Awal Cash", "Cash Masuk",
      "Cash Keluar Operasional", "Setor Bank", "Tarik Cash",
      "Cash Keluar Lainnya", "Saldo Akhir Cash", "Status Closing",
    ]) expect(source).toContain(label);
    expect(source).not.toContain("window.alert(");
    expect(source).not.toContain("window.prompt(");
    expect(source).not.toContain("window.confirm(");
  });
});

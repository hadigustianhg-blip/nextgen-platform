"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import {
  AppCard, FilterCard, MetricCard, PageHeader, TableCard,
  nextgenButtonClass, nextgenControlClass, nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type Row = { transactionType: string; total: number };
type Result = {
  income: Row[]; expense: Row[];
  summary: { totalIncome: number; totalExpense: number; difference: number };
  receivedAt: string;
};
const today = jakartaOperationalDate();
const money = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(value);
const initial: Result = {
  income: [], expense: [],
  summary: { totalIncome: 0, totalExpense: 0, difference: 0 },
  receivedAt: "",
};

function validRange(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Boolean(startDate && endDate && Number.isFinite(start) && Number.isFinite(end)
    && start <= end && (end - start) / 86_400_000 <= 30);
}

export function JfsCashflowClient({ canExport }: { canExport: boolean }) {
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [result, setResult] = useState(initial);
  const [hasChecked, setHasChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  async function check() {
    if (!validRange(startDate, endDate)) {
      setNotice("Rentang tanggal tidak valid.");
      return;
    }
    setLoading(true); setNotice("");
    try {
      const response = await fetch("/api/finance/cashflow-jfs/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setResult(await response.json());
      setHasChecked(true);
    } catch {
      setNotice("Layanan Cashflow JFS sedang tidak tersedia.");
    } finally {
      setLoading(false);
    }
  }

  const received = result.receivedAt
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta",
      }).format(new Date(result.receivedAt))
    : "";
  const exportUrl = `/api/finance/cashflow-jfs/export?${new URLSearchParams({ startDate, endDate })}`;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Cashflow JFS"
      description="Pemeriksaan pemasukan dan pengeluaran langsung dari laporan JFS."
      actions={canExport && hasChecked
        ? <a href={exportUrl} className={nextgenNeutralButtonClass}><Download size={17}/>Export Excel</a>
        : undefined}/>
    {notice && <div role="status" className="rounded-xl border bg-white px-4 py-3 text-sm">{notice}</div>}
    <FilterCard><div className="grid gap-3 md:grid-cols-3">
      <input aria-label="Tanggal Awal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={nextgenControlClass}/>
      <input aria-label="Tanggal Akhir" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={nextgenControlClass}/>
      <button disabled={loading} onClick={() => void check()} className={nextgenButtonClass}>
        {loading && <LoaderCircle className="animate-spin" size={17}/>}
        {loading ? "Checking..." : "CEK"}
      </button>
    </div></FilterCard>
    {hasChecked && <>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Pemasukan" value={money(result.summary.totalIncome)}/>
        <MetricCard label="Total Pengeluaran" value={money(result.summary.totalExpense)}/>
        <MetricCard label="Selisih" value={money(result.summary.difference)}/>
      </section>
      <section className="grid gap-5 md:grid-cols-2">
        <CashflowPanel title="PEMASUKAN" rows={result.income} total={result.summary.totalIncome}/>
        <CashflowPanel title="PENGELUARAN" rows={result.expense} total={result.summary.totalExpense}/>
      </section>
      <AppCard className="px-4 py-3 text-sm text-slate-600">
        <strong className="text-emerald-700">Data berhasil diambil</strong>
        <span className="ml-2">{received} WIB</span>
      </AppCard>
    </>}
  </div>;
}

function CashflowPanel({ title, rows, total }: { title: string; rows: Row[]; total: number }) {
  return <TableCard className="h-full" footer={<div className="flex justify-between font-bold"><span>TOTAL {title}</span><span>{money(total)}</span></div>}>
    <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold">{title}</h2></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">No</th><th className="px-4 py-3">Jenis Transaksi</th><th className="px-4 py-3 text-right">Total Bulan Terpilih</th></tr></thead>
      <tbody className="divide-y">{rows.length ? rows.map((row, index) => <tr key={row.transactionType}><td className="px-4 py-3">{index + 1}</td><td className="px-4 py-3">{row.transactionType}</td><td className="px-4 py-3 text-right font-semibold">{money(row.total)}</td></tr>) : <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-500">Tidak ada data.</td></tr>}</tbody>
    </table></div>
  </TableCard>;
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Daily = {
  businessDate: string; openingCash: string; cashIn: string; operationalExpense: string;
  bankDeposit: string; cashWithdrawal: string; otherCashOut: string; closingCash: string;
  totalCashOut: string;
  pickupOutstanding: string; deliveryOutstanding: string; closingStatus: string;
  physicalCash: string | null; cashVariance: string | null;
  cashInBreakdown: Record<string, string>; cashOutBreakdown: Record<string, string>;
};
type Result = {
  summary: { cashOnHand: string; bankBalance: string; pickupOutstanding: string; deliveryOutstanding: string; bankDepositThisMonth: string };
  dailyRows: Daily[];
  period: { month: number; year: number; startDate: string; endDate: string; totalDays: number };
};
const money = (value: string | null) => value == null ? "—" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
const jakartaNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));

export function PaymentSettlementClient({ outletId }: { outletId: string }) {
  const now = jakartaNow();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [closingStatus, setClosingStatus] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [detail, setDetail] = useState<Daily | null>(null);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ month: String(month), year: String(year), outletId, closingStatus });
    const response = await fetch(`/api/payment-settlement?${query}`, { cache: "no-store" });
    if (response.ok) setResult(await response.json() as Result);
  }, [month, year, outletId, closingStatus]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  function shift(delta: number) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    setMonth(date.getUTCMonth() + 1); setYear(date.getUTCFullYear());
  }
  async function openDay(date: string) {
    const response = await fetch(`/api/payment-settlement/${date}`, { cache: "no-store" });
    if (response.ok) setDetail((await response.json()).data as Daily);
  }
  const current = () => { const date = jakartaNow(); setMonth(date.getMonth() + 1); setYear(date.getFullYear()); };
  return <div className="space-y-6">
    <header><p className="text-sm font-semibold text-blue-600">Payment</p><h1 className="text-3xl font-black">Payment Settlement</h1><p className="text-sm text-slate-500">Monitoring read-only posisi kas dan kewajiban pembayaran global.</p></header>
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4">
      <button onClick={() => shift(-1)} className="rounded-xl border p-2" aria-label="Bulan sebelumnya"><ChevronLeft /></button>
      <select aria-label="Bulan" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-xl border p-2">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index).toLocaleDateString("id-ID", { month: "long" })}</option>)}</select>
      <select aria-label="Tahun" value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border p-2">{Array.from({ length: 7 }, (_, index) => now.getFullYear() - 3 + index).map((value) => <option key={value}>{value}</option>)}</select>
      <button onClick={() => shift(1)} className="rounded-xl border p-2" aria-label="Bulan berikutnya"><ChevronRight /></button>
      <button onClick={current} className="rounded-xl border px-4 py-2 text-sm font-bold">Bulan Ini</button>
      <select aria-label="Outlet" value={outletId} disabled className="rounded-xl border bg-slate-50 p-2"><option value={outletId}>Outlet Aktif</option></select>
      <select aria-label="Status closing" value={closingStatus} onChange={(e) => setClosingStatus(e.target.value)} className="ml-auto rounded-xl border p-2"><option value="">Semua Closing</option><option value="BELUM_CLOSING">Belum Closing</option><option value="OPEN">Open</option><option value="REOPENED">Reopened</option><option value="CLOSED">Closed</option></select>
    </section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{[
      ["Cash On Hand", result?.summary.cashOnHand, ""],
      ["Saldo Bank Tercatat", result?.summary.bankBalance, "Saldo berdasarkan mutasi NEXTGEN, bukan saldo realtime bank."],
      ["Pickup Belum Bayar", result?.summary.pickupOutstanding, ""],
      ["Delivery Belum Clear", result?.summary.deliveryOutstanding, ""],
      ["Setor Bank Bulan Ini", result?.summary.bankDepositThisMonth, ""],
    ].map(([label, value, note]) => <div key={label} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-black">{money(value ?? "0")}</p>{note && <p className="mt-2 text-xs text-amber-700">{note}</p>}</div>)}</section>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1450px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Tanggal","Saldo Awal Cash","Cash Masuk","Cash Keluar Operasional","Setor Bank","Tarik Cash","Cash Keluar Lainnya","Saldo Akhir Cash","Pickup Outstanding","Delivery Outstanding","Status Closing"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{result?.dailyRows.length ? result.dailyRows.map((row) => <tr key={row.businessDate} onClick={() => void openDay(row.businessDate)} className="cursor-pointer hover:bg-blue-50/50"><td className="px-4 py-3 font-bold">{row.businessDate}</td><td className="px-4">{money(row.openingCash)}</td><td className="px-4 text-emerald-700">{money(row.cashIn)}</td><td className="px-4">{money(row.operationalExpense)}</td><td className="px-4">{money(row.bankDeposit)}</td><td className="px-4">{money(row.cashWithdrawal)}</td><td className="px-4">{money(row.otherCashOut)}</td><td className="px-4 font-bold">{money(row.closingCash)}</td><td className="px-4">{money(row.pickupOutstanding)}</td><td className="px-4">{money(row.deliveryOutstanding)}</td><td className="px-4">{row.closingStatus.replace("_", " ")}</td></tr>) : <tr><td colSpan={11} className="p-14 text-center text-slate-500">Belum ada transaksi pada periode ini. Saldo global tetap ditampilkan di atas.</td></tr>}</tbody></table></div><div className="border-t p-4 text-sm text-slate-500">{result?.period.totalDays ?? 0} business date</div></section>
    {detail && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6"><div className="flex justify-between"><div><h2 className="text-xl font-black">Detail {detail.businessDate}</h2><p className="text-sm text-slate-500">{detail.closingStatus.replace("_", " ")}</p></div><button onClick={() => setDetail(null)}><X /></button></div><div className="mt-5 grid gap-3 md:grid-cols-4">{[["Saldo Awal",detail.openingCash],["Cash Masuk",detail.cashIn],["Total Cash Keluar",detail.totalCashOut],["Setor Bank",detail.bankDeposit],["Saldo Akhir",detail.closingCash],["Physical Cash",detail.physicalCash],["Variance",detail.cashVariance],["Pickup Outstanding",detail.pickupOutstanding],["Delivery Outstanding",detail.deliveryOutstanding]].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><b>{money(value)}</b></div>)}</div><div className="mt-5 grid gap-4 md:grid-cols-2"><Breakdown title="Cash Masuk" values={detail.cashInBreakdown} /><Breakdown title="Cash Keluar" values={detail.cashOutBreakdown} /></div><Link href={`/dashboard/payment/cash-flow?startDate=${detail.businessDate}&endDate=${detail.businessDate}`} className="mt-5 block rounded-xl bg-blue-600 p-3 text-center font-bold text-white">Lihat Mutasi Cash Flow</Link></div></div>}
  </div>;
}

function Breakdown({ title, values }: { title: string; values: Record<string, string> }) {
  return <div className="rounded-xl border p-4"><h3 className="font-black">{title}</h3><div className="mt-3 space-y-2 text-sm">{Object.entries(values).map(([label, value]) => <div key={label} className="flex justify-between"><span>{label.replace(/([A-Z])/g, " $1")}</span><b>{money(value)}</b></div>)}</div></div>;
}

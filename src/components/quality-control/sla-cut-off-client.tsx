"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { getSlaCycle } from "@/modules/quality-control/sla-cut-off.calculation";

type Outlet = { id: string; code: string; name: string };
type Result = {
  period: { startDate: string; endDate: string; target: number };
  summary: { averageSla: number; totalPaketSampai: number; sudahTandaTerima: number; belumTandaTerima: number; lewatSla: number; hariAchieve: number; hariNotAchieve: number; status: string };
  items: Array<{ businessDate: string; sla: number; paketSampai: number; sudahTandaTerima: number; belumTandaTerima: number; lewatSla: number; status: string }>;
};
const empty: Result = { period: { startDate: "", endDate: "", target: 95 }, summary: { averageSla: 0, totalPaketSampai: 0, sudahTandaTerima: 0, belumTandaTerima: 0, lewatSla: 0, hariAchieve: 0, hariNotAchieve: 0, status: "NOT_ACHIEVE" }, items: [] };
const idDate = (value: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(`${value}T12:00:00+07:00`));
const cycleLabel = (start: string, end: string) => `${idDate(start)}–${idDate(end)}`;
const number = (value: number) => new Intl.NumberFormat("id-ID").format(value);

export function SlaCutOffClient({ outlets, initialOutletId, businessDate, canSync }: { outlets: Outlet[]; initialOutletId: string; businessDate: string; canSync: boolean }) {
  const active = useMemo(() => getSlaCycle(businessDate), [businessDate]);
  const cycles = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${active.startDate}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() - index);
    return getSlaCycle(date.toISOString().slice(0, 10));
  }), [active]);
  const [outletId, setOutletId] = useState(initialOutletId);
  const [periodStart, setPeriodStart] = useState(active.startDate);
  const periodEnd = cycles.find((cycle) => cycle.startDate === periodStart)?.endDate ?? active.endDate;
  const [result, setResult] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!outletId) return;
    setLoading(true); setNotice("");
    try {
      const params = new URLSearchParams({ outletId, periodStart, periodEnd });
      const response = await fetch(`/api/quality-control/sla-cut-off?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal memuat data.");
      setResult(payload);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Gagal memuat data."); }
    finally { setLoading(false); }
  }, [outletId, periodStart, periodEnd]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const sync = async () => {
    setSyncing(true); setNotice("");
    try {
      const response = await fetch("/api/quality-control/sla-cut-off/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outletId, periodStart, periodEnd }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Sinkronisasi gagal.");
      setNotice(payload.skippedOutsidePeriod ? "Snapshot sumber berada di luar periode terpilih; tidak ada histori yang diubah." : "Snapshot SLA berhasil disinkronkan.");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Sinkronisasi gagal."); }
    finally { setSyncing(false); }
  };
  const cards = [
    ["Average SLA", `${result.summary.averageSla.toLocaleString("id-ID", { minimumFractionDigits: 2 })}%`, result.summary.status],
    ["Total Paket Sampai", number(result.summary.totalPaketSampai), ""],
    ["Sudah Tanda Terima", number(result.summary.sudahTandaTerima), ""],
    ["Belum Tanda Terima", number(result.summary.belumTandaTerima), ""],
    ["Lewat SLA", number(result.summary.lewatSla), ""],
    ["Hari Achieve", number(result.summary.hariAchieve), "≥ 95%"],
    ["Hari Not Achieve", number(result.summary.hariNotAchieve), "< 95%"],
  ];
  return <div>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">Quality Control</p><h1 className="mt-1 text-3xl font-extrabold text-slate-950">SLA Cut Off</h1><p className="mt-2 text-sm text-slate-600">Monitoring performa SLA berdasarkan periode operasional tanggal 21 sampai 20.</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><ShieldCheck className="mr-2 inline" size={18}/>Target SLA <b>95%</b></div></header>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-semibold text-slate-600">Periode SLA<select aria-label="Periode SLA" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">{cycles.map((cycle) => <option key={cycle.startDate} value={cycle.startDate}>{cycleLabel(cycle.startDate, cycle.endDate)}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Outlet<select aria-label="Outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.code} — {outlet.name}</option>)}</select></label>
      <button disabled={loading || syncing} onClick={() => void load()} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 font-semibold text-slate-700 disabled:opacity-50"><RefreshCw size={17}/>Refresh</button>
      {canSync && <button disabled={loading || syncing} onClick={() => void sync()} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 font-semibold text-white disabled:opacity-50">{syncing && <LoaderCircle className="animate-spin" size={17}/>} {syncing ? "Menyinkronkan..." : "Sinkronkan Data"}</button>}
    </div><p className="mt-3 text-xs text-slate-500">Periode aktif: {cycleLabel(active.startDate, active.endDate)}. Sumber menyediakan snapshot per hari; histori terbentuk dari sinkronisasi harian.</p>{notice && <p role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{notice}</p>}</section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,detail]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-3 text-2xl font-extrabold text-slate-950">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</article>)}</section>
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="text-lg font-bold">SLA Harian</h2><p className="text-sm text-slate-500">{cycleLabel(periodStart, periodEnd)}</p></div><div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr>{["No","Tanggal","SLA","Paket Sampai","Sudah Tanda Terima","Belum Tanda Terima","Lewat SLA","Status"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={8} className="py-14 text-center text-slate-500">Memuat data…</td></tr> : result.items.length === 0 ? <tr><td colSpan={8} className="py-14 text-center text-slate-500">Belum ada data SLA pada periode ini.</td></tr> : result.items.map((row,index) => <tr key={row.businessDate}><td className="px-4 py-3">{index+1}</td><td className="px-4 py-3">{idDate(row.businessDate)}</td>{[`${row.sla.toLocaleString("id-ID")}%`,number(row.paketSampai),number(row.sudahTandaTerima),number(row.belumTandaTerima),number(row.lewatSla)].map((v,i)=><td key={i} className="px-4 py-3 text-right tabular-nums">{v}</td>)}<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.status==="ACHIEVE"?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700"}`}>{row.status==="ACHIEVE"?"ACHIEVE":"NOT ACHIEVE"}</span></td></tr>)}</tbody></table></div></section>
  </div>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import {
  FilterCard,
  MetricCard,
  PageHeader,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type Row = {
  id: string;
  businessDate: string;
  waybill: string;
  customer: string | null;
  goodsName: string | null;
  inventoryHours: number;
  currentScanSite: string | null;
  currentScanTime: string | null;
  currentScanType: string | null;
  scanType: string | null;
  problemReason: string | null;
  void: string | null;
  statusFound: boolean;
  status: "NORMAL" | "PROBLEM" | "VOID" | "STATUS_NOT_FOUND";
};
type Result = {
  data: Row[];
  summary: {
    totalInventory: number;
    uniqueWaybills: number;
    statusFound: number;
    statusNotFound: number;
    totalProblem: number;
    totalVoid: number;
    averageInventoryHours: number;
  };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
const empty: Result = {
  data: [],
  summary: {
    totalInventory: 0, uniqueWaybills: 0, statusFound: 0,
    statusNotFound: 0, totalProblem: 0, totalVoid: 0,
    averageInventoryHours: 0,
  },
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const date = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
const statusLabel = {
  NORMAL: "NORMAL",
  PROBLEM: "PROBLEM",
  VOID: "VOID",
  STATUS_NOT_FOUND: "STATUS NOT FOUND",
};
const statusTone = {
  NORMAL: "bg-emerald-100 text-emerald-700",
  PROBLEM: "bg-red-100 text-red-700",
  VOID: "bg-slate-200 text-slate-700",
  STATUS_NOT_FOUND: "bg-amber-100 text-amber-800",
};

export function WaybillStuckDeliveryClient({ canSync }: { canSync: boolean }) {
  const [result, setResult] = useState(empty);
  const [businessDate, setBusinessDate] = useState(jakartaOperationalDate);
  const [inputs, setInputs] = useState({ waybill: "", customer: "", goodsName: "", currentScanSite: "", problem: "" });
  const [filters, setFilters] = useState(inputs);
  const [voidFilter, setVoidFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setFilters(inputs);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [inputs]);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const query = new URLSearchParams({
        businessDate,
        ...filters,
        void: voidFilter,
        page: String(page),
        pageSize: "20",
      });
      const response = await fetch(`/api/quality-control/waybill-stuck-delivery?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch {
      setNotice("Data Waybill Stuck Delivery tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [businessDate, filters, page, voidFilter]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setNotice("");
    try {
      const response = await fetch("/api/quality-control/waybill-stuck-delivery/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessDate }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error();
      setNotice(`Sinkronisasi selesai: ${payload.inventory.fetched} inventory, ${payload.status.fetched} status${payload.failedBatches ? `, ${payload.failedBatches} batch gagal` : ""}.`);
      await load();
    } catch {
      setNotice("Sinkronisasi Waybill Stuck Delivery gagal. Data lama tetap dipertahankan.");
    } finally {
      setSyncing(false);
    }
  }

  const update = (key: keyof typeof inputs, value: string) =>
    setInputs((current) => ({ ...current, [key]: value }));
  const cards = [
    ["Total Inventory", result.summary.totalInventory],
    ["Waybill Unik", result.summary.uniqueWaybills],
    ["Status Ditemukan", result.summary.statusFound],
    ["Status Tidak Ditemukan", result.summary.statusNotFound],
    ["Total Problem", result.summary.totalProblem],
    ["Total Void", result.summary.totalVoid],
    ["Average Inventory Hours", `${result.summary.averageInventoryHours.toLocaleString("id-ID")} jam`],
  ];

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Quality Control"
      title="Waybill Stuck Delivery"
      description="Monitoring paket yang masih berada di Inventory beserta status scan terakhir."
      actions={<>
        <button disabled={loading || syncing} onClick={() => void load()} className={nextgenNeutralButtonClass}><RefreshCw size={17}/>Refresh</button>
        {canSync && <button disabled={loading || syncing} onClick={() => void sync()} className={`${nextgenButtonClass} bg-blue-600 text-white`}>{syncing ? <LoaderCircle className="animate-spin" size={17}/> : <RefreshCw size={17}/>} {syncing ? "Menyinkronkan..." : "Sinkronkan Data"}</button>}
      </>}
    />
    {notice && <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{notice}</div>}
    <FilterCard>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input aria-label="Business Date" type="date" value={businessDate} onChange={(event) => { setPage(1); setBusinessDate(event.target.value); }} className={nextgenControlClass}/>
        <input aria-label="Waybill" value={inputs.waybill} onChange={(event) => update("waybill", event.target.value)} placeholder="Waybill" className={nextgenControlClass}/>
        <input aria-label="Customer" value={inputs.customer} onChange={(event) => update("customer", event.target.value)} placeholder="Customer" className={nextgenControlClass}/>
        <input aria-label="Goods Name" value={inputs.goodsName} onChange={(event) => update("goodsName", event.target.value)} placeholder="Goods Name" className={nextgenControlClass}/>
        <input aria-label="Current Scan Site" value={inputs.currentScanSite} onChange={(event) => update("currentScanSite", event.target.value)} placeholder="Current Scan Site" className={nextgenControlClass}/>
        <input aria-label="Problem" value={inputs.problem} onChange={(event) => update("problem", event.target.value)} placeholder="Problem" className={nextgenControlClass}/>
        <select aria-label="Void" value={voidFilter} onChange={(event) => { setPage(1); setVoidFilter(event.target.value); }} className={nextgenControlClass}><option value="">Semua Void</option><option value="true">Void</option><option value="false">Tidak Void</option></select>
      </div>
    </FilterCard>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map(([label,value]) => <MetricCard key={label} label={label} value={typeof value === "number" ? value.toLocaleString("id-ID") : value}/>)}
    </section>
    <TableCard footer={<div className="flex items-center justify-between"><span>{result.pagination.total} inventory</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Sebelumnya</button><span className="px-2 py-1.5">{page} / {Math.max(1,result.pagination.totalPages)}</span><button disabled={page >= result.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Berikutnya</button></div></div>}>
      <div className="overflow-x-auto"><table className="min-w-[1600px] w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Business Date","Waybill","Customer","Goods Name","Inventory Hours","Current Scan Site","Current Scan Time","Current Scan Type","Scan Type","Problem Reason","Void","Status"].map((label)=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={12} className="py-14 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Memuat data…</td></tr> : result.data.length === 0 ? <tr><td colSpan={12} className="py-14 text-center text-slate-500">Belum ada data Inventory pada Business Date ini.</td></tr> : result.data.map((row)=><tr key={row.id}><td className="px-4 py-3">{date(row.businessDate)}</td><td className="px-4 py-3 font-semibold">{row.waybill}</td><td className="px-4 py-3">{row.customer ?? "—"}</td><td className="max-w-72 truncate px-4 py-3" title={row.goodsName ?? ""}>{row.goodsName ?? "—"}</td><td className="px-4 py-3 text-right tabular-nums">{row.inventoryHours.toLocaleString("id-ID")}</td><td className="px-4 py-3">{row.currentScanSite ?? "—"}</td><td className="px-4 py-3">{row.currentScanTime ?? "—"}</td><td className="px-4 py-3">{row.currentScanType ?? "—"}</td><td className="px-4 py-3">{row.scanType ?? "—"}</td><td className="max-w-72 truncate px-4 py-3" title={row.problemReason ?? ""}>{row.problemReason ?? "—"}</td><td className="px-4 py-3">{row.void ?? "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone[row.status]}`}>{statusLabel[row.status]}</span></td></tr>)}</tbody>
      </table></div>
    </TableCard>
  </div>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import { formatDateTime, formatMoney } from "./pickup-format";

type MasterRow = {
  id: string;
  waybillNo: string;
  staff: string | null;
  sender: string | null;
  freightAmount: string;
  syncStatus: string;
  updatedAt: string;
};

export function MasterPickupClient() {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const query = useMemo(() => new URLSearchParams({ page: String(page), pageSize: String(pageSize), search }).toString(), [page, pageSize, search]);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/pickup/master?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setRows(body.data.rows);
      setPagination(body.data.pagination);
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => { queueMicrotask(() => void loadData()); }, [loadData]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Pickup normalization</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">MASTER PICKUP</h1>
          <p className="mt-2 text-sm text-slate-500">Perbandingan read-only hasil normalisasi RAW Pickup.</p>
        </div>
        <button onClick={() => void loadData()} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <label className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari waybill…" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" />
          </label>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-10 rounded-xl border border-slate-200 px-3 text-sm">
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} baris</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>{["Waybill", "Staff", "Pengirim", "Ongkir", "Status sinkronisasi", "Waktu diperbarui"].map((column) => <th key={column} className="px-5 py-3 font-bold">{column}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="py-16 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin" />Memuat data…</td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="py-16 text-center text-slate-500">Belum ada data master pickup.</td></tr> : rows.map((row) => (
                <tr key={row.id} className="hover:bg-blue-50/30">
                  <td className="px-5 py-3 font-bold text-blue-700">{row.waybillNo}</td>
                  <td className="px-5 py-3">{row.staff ?? "—"}</td>
                  <td className="px-5 py-3">{row.sender ?? "—"}</td>
                  <td className="px-5 py-3">{formatMoney(row.freightAmount)}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{row.syncStatus}</span></td>
                  <td className="px-5 py-3">{formatDateTime(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm text-slate-600">
          <span>{pagination.total} data</span>
          <div className="flex items-center gap-3">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Sebelumnya</button>
            <span>Halaman {pagination.page} / {pagination.totalPages}</span>
            <button disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Berikutnya</button>
          </div>
        </div>
      </section>
    </div>
  );
}

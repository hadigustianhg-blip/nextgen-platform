"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudDownload, LoaderCircle, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { formatDateTime, formatMoney } from "./pickup-format";

type RawRow = {
  id: string;
  sourceFetchedAt: string;
  waybillNo: string;
  pickNetwork: string | null;
  destination: string | null;
  settlement: string | null;
  totalFreight: string;
  freight: string;
  weight: string;
  staff: string | null;
  sender: string | null;
  service: string | null;
  receiver: string | null;
  address: string | null;
  syncStatus: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

type Run = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  pickupFetchedCount: number;
  pickupCreatedCount: number;
  pickupUpdatedCount: number;
  duplicateCount: number;
  anomalyCount: number;
};

type ListResponse = {
  rows: RawRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const initialList: ListResponse = {
  rows: [],
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
};

export function RawPickupClient({ outletCode }: { outletCode: string }) {
  const [list, setList] = useState(initialList);
  const [latestRun, setLatestRun] = useState<Run | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState("");
  const [destination, setDestination] = useState("");
  const [settlement, setSettlement] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      search,
      staff,
      destination,
      settlement,
    });
    return params.toString();
  }, [page, pageSize, search, staff, destination, settlement]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rawResponse, runResponse] = await Promise.all([
        fetch(`/api/pickup/raw?${query}`, { cache: "no-store" }),
        fetch("/api/pickup/runs/latest", { cache: "no-store" }),
      ]);
      if (!rawResponse.ok || !runResponse.ok) throw new Error("LOAD_FAILED");
      const rawBody = await rawResponse.json();
      const runBody = await runResponse.json();
      setList(rawBody.data);
      setLatestRun(runBody.data);
    } catch {
      setNotice({ tone: "error", text: "Data pickup belum dapat dimuat." });
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  async function runSync() {
    setSyncing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/pickup/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setNotice({
        tone: "success",
        text: `Sinkronisasi selesai. ${body.data.created} baru, ${body.data.updated} diperbarui, ${body.data.duplicate} duplikat.`,
      });
      setPage(1);
      await loadData();
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error && error.message !== "undefined"
            ? error.message
            : "Sinkronisasi pickup gagal.",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Pickup operations</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">RAW PICKUP</h1>
          <p className="mt-2 text-sm text-slate-500">Data asli pickup dari middleware JFS untuk outlet aktif.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Outlet aktif
            <select disabled value={outletCode} className="mt-1 block min-w-36 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm">
              <option>{outletCode}</option>
            </select>
          </label>
          <button type="button" onClick={() => void loadData()} disabled={loading || syncing} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" onClick={() => void runSync()} disabled={syncing} className="flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-60">
            {syncing ? <LoaderCircle size={17} className="animate-spin" /> : <CloudDownload size={17} />}
            {syncing ? "Sinkronisasi berjalan…" : "Sinkronkan Data"}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.tone === "error" && <TriangleAlert size={17} />}
          {notice.text}
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div>
            <h2 className="font-bold text-slate-900">Sinkronisasi terakhir</h2>
            <p className="mt-1 text-xs text-slate-500">Terakhir sinkronisasi: {formatDateTime(latestRun?.completedAt)}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${latestRun?.status === "SUCCESS" ? "bg-emerald-100 text-emerald-700" : latestRun?.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
            {latestRun?.status ?? "BELUM ADA RUN"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-9">
          {[
            ["Run ID", latestRun?.id ? `${latestRun.id.slice(0, 8)}…` : "—"],
            ["Mulai", formatDateTime(latestRun?.startedAt)],
            ["Selesai", formatDateTime(latestRun?.completedAt)],
            ["Fetched", latestRun?.pickupFetchedCount ?? 0],
            ["Created", latestRun?.pickupCreatedCount ?? 0],
            ["Updated", latestRun?.pickupUpdatedCount ?? 0],
            ["Duplicate", latestRun?.duplicateCount ?? 0],
            ["Anomaly", latestRun?.anomalyCount ?? 0],
            ["Total RAW", list.pagination.total],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800" title={String(value)}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari waybill…" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm" />
          </label>
          <input value={staff} onChange={(event) => { setStaff(event.target.value); setPage(1); }} placeholder="Filter staff" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
          <input value={destination} onChange={(event) => { setDestination(event.target.value); setPage(1); }} placeholder="Filter destination" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
          <input value={settlement} onChange={(event) => { setSettlement(event.target.value); setPage(1); }} placeholder="Filter settlement" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-10 rounded-xl border border-slate-200 px-3 text-sm">
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} baris</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[2300px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>{["Tanggal / waktu source", "Waybill", "Pick Network", "Destination", "Settlement", "Total Freight", "Freight", "Weight", "Staff", "Sender", "Service", "Receiver", "Address", "Sync Status", "First Seen", "Last Seen"].map((column) => <th key={column} className="px-4 py-3 font-bold">{column}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={16} className="px-4 py-16 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin" />Memuat data…</td></tr>
              ) : list.rows.length === 0 ? (
                <tr><td colSpan={16} className="px-4 py-16 text-center text-slate-500">Belum ada data pickup.</td></tr>
              ) : list.rows.map((row) => (
                <tr key={row.id} className="hover:bg-blue-50/30">
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.sourceFetchedAt)}</td>
                  <td className="px-4 py-3 font-bold text-blue-700">{row.waybillNo}</td>
                  <td className="px-4 py-3">{row.pickNetwork ?? "—"}</td>
                  <td className="px-4 py-3">{row.destination ?? "—"}</td>
                  <td className="px-4 py-3">{row.settlement ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatMoney(row.totalFreight)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatMoney(row.freight)}</td>
                  <td className="px-4 py-3">{row.weight}</td>
                  <td className="px-4 py-3">{row.staff ?? "—"}</td>
                  <td className="px-4 py-3">{row.sender ?? "—"}</td>
                  <td className="px-4 py-3">{row.service ?? "—"}</td>
                  <td className="px-4 py-3">{row.receiver ?? "—"}</td>
                  <td className="max-w-64 truncate px-4 py-3" title={row.address ?? ""}>{row.address ?? "—"}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">{row.syncStatus}</span></td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.firstSeenAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm text-slate-600">
          <span>{list.pagination.total} data</span>
          <div className="flex items-center gap-3">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Sebelumnya</button>
            <span>Halaman {list.pagination.page} / {list.pagination.totalPages}</span>
            <button disabled={page >= list.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Berikutnya</button>
          </div>
        </div>
      </section>
    </div>
  );
}

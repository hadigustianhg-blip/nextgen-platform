"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircle, RefreshCw, X } from "lucide-react";
import {
  FilterCard, MetricCard, PageHeader, TableCard, nextgenButtonClass,
  nextgenControlClass, nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaDateRange } from "@/lib/dates/jakarta-date";
import {
  buildPickupMessage, buildPickupWhatsAppUrl, normalizePickupPhone,
} from "@/modules/quality-control/pickup-scheduling-whatsapp";

type OperationalRow = {
  rowId: string; recordId: string; externalJfsId: string | null; sourceProvider: string;
  waybill: string; inputTime: string | null; businessDate: string; source: string | null;
  status: string | null; statusCode: number | null; sendName: string | null;
  senderName: string | null; senderCompany: string | null; senderPhoneMasked: string | null;
  senderCity: string | null; senderArea: string | null; pickupAddressMasked: string | null;
  pickupStaff: string | null; pickupStaffCode: string | null; pickupNetwork: string | null;
  bestPickTime: string | null; goodsName: string | null; weight: number;
  pickupFailed: boolean; pickFailReason: string | null;
};
type FilterOption = { value: string; label: string };
type Result = {
  summary: { totalWaybills: number; totalSchedules: number; validMaskedPhones: number };
  filterOptions: { statuses: FilterOption[]; methods: FilterOption[]; pickupStaff: FilterOption[] };
  rows: OperationalRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type RowDetail = {
  requestId: string; rowId: string; senderName: string | null; senderMobilePhone: string | null;
  outletCode: string | null;
  orders: Array<{ waybill: string; source: string | null; goodsName: string | null }>;
};
const empty: Result = {
  summary: { totalWaybills: 0, totalSchedules: 0, validMaskedPhones: 0 },
  filterOptions: { statuses: [], methods: [], pickupStaff: [] },
  rows: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const blankFilters = { orderStatus: "", sendName: "", pickupStaff: "" };
const defaultRange = jakartaDateRange(3);
const isCalendarDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() === Number(match[2]) - 1
    && parsed.getUTCDate() === Number(match[3]);
};
const validRange = (startDate: string, endDate: string) => {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return isCalendarDate(startDate) && isCalendarDate(endDate)
    && Number.isFinite(start) && Number.isFinite(end)
    && start <= end && (end - start) / 86_400_000 <= 30;
};
const formatDateTime = (value: string | null, fallback = "—") => value
  ? new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : fallback;

export function PickupSchedulingClient({ canSync, canConfirm }: { canSync: boolean; canConfirm: boolean }) {
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [filters, setFilters] = useState(blankFilters);
  const [result, setResult] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const detailCache = useRef(new Map<string, RowDetail>());
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!validRange(startDate, endDate)) { setNotice("Rentang tanggal tidak valid."); return; }
    setLoading(true); setNotice("");
    try {
      const query = new URLSearchParams({ startDate, endDate, ...filters, page: String(page), pageSize: "20" });
      const response = await fetch(`/api/quality-control/pickup-scheduling?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setNotice("Data Penjadwalan Pickup tidak dapat dimuat."); }
    finally { setLoading(false); }
  }, [endDate, filters, page, startDate]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [endDate, filters, page, startDate]);

  async function sync() {
    if (syncing) return;
    if (!validRange(startDate, endDate)) { setNotice("Rentang tanggal tidak valid."); return; }
    setSyncing(true); setNotice("");
    try {
      const response = await fetch("/api/quality-control/pickup-scheduling/sync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) throw new Error("SYNC_IN_PROGRESS");
        throw new Error(response.status >= 500 ? "SOURCE_UNAVAILABLE" : "SYNC_FAILED");
      }
      await load();
      setNotice(`Sinkronisasi selesai: ${body.fetched} record sumber.`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(code === "SYNC_IN_PROGRESS" ? "Sinkronisasi sedang berjalan."
        : code === "SOURCE_UNAVAILABLE" ? "Layanan sumber sedang tidak tersedia."
        : "Sinkronisasi gagal. Data lama tetap tersedia.");
    } finally { setSyncing(false); }
  }

  async function loadRowDetail(row: OperationalRow) {
    const key = `${row.rowId}:${startDate}:${endDate}`;
    const cached = detailCache.current.get(key);
    if (cached) return cached;
    const query = new URLSearchParams({ startDate, endDate });
    const response = await fetch(`/api/quality-control/pickup-scheduling/records/${row.rowId}/detail?${query}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as RowDetail | null;
    if (!response.ok || !body?.orders) throw new Error(response.status === 404 ? "ROW_NOT_FOUND" : "DETAIL_FAILED");
    detailCache.current.set(key, body);
    return body;
  }

  async function confirmSelected() {
    if (confirming || selected.size === 0) return;
    const rows = result.rows.filter(row => selected.has(row.rowId));
    setConfirming(true); setNotice("");
    let opened = 0;
    try {
      for (const row of rows) {
        const detail = await loadRowDetail(row);
        if (!detail.senderMobilePhone || !normalizePickupPhone(detail.senderMobilePhone)) continue;
        const url = buildPickupWhatsAppUrl(detail.senderMobilePhone, buildPickupMessage({
          customerName: detail.senderName, outletCode: detail.outletCode, orders: detail.orders,
        }));
        if (!url) continue;
        const anchor = document.createElement("a");
        anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.click();
        opened += 1;
      }
      setNotice(opened === rows.length
        ? `${opened} konfirmasi pickup dibuka di WhatsApp.`
        : `${opened} dari ${rows.length} konfirmasi dapat dibuka. Detail lainnya tidak tersedia.`);
      if (opened > 0) { setSelectionMode(false); setSelected(new Set()); }
    } catch { setNotice("Detail JFS untuk pickup terpilih tidak dapat diambil. Tidak ada nomor masked yang digunakan."); }
    finally { setConfirming(false); }
  }

  const setFilter = (key: keyof typeof blankFilters, value: string) => {
    setPage(1); setFilters(current => ({ ...current, [key]: value }));
  };
  const reset = () => { setPage(1); setFilters(blankFilters); };
  const cancelSelection = () => { setSelectionMode(false); setSelected(new Set()); };
  const toggleRow = (rowId: string) => setSelected(current => {
    const next = new Set(current); if (next.has(rowId)) next.delete(rowId); else next.add(rowId); return next;
  });
  const preset = (daysBack: number) => {
    const range = jakartaDateRange(daysBack); setPage(1); setStartDate(range.startDate); setEndDate(range.endDate);
  };

  return <div className="space-y-6">
    <PageHeader eyebrow="Quality Control" title="Penjadwalan Pickup"
      description="Pengelolaan jadwal pickup dan konfirmasi kesiapan customer."
      actions={<>
        <button disabled={loading || syncing} onClick={() => void load()} className={nextgenNeutralButtonClass}><RefreshCw size={17}/>Refresh</button>
        {canSync && <button disabled={loading || syncing} onClick={() => void sync()} className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700`}>
          {syncing ? <LoaderCircle className="animate-spin" size={17}/> : <RefreshCw size={17}/>}Sinkronkan Data
        </button>}
        {canConfirm && !selectionMode && <button onClick={() => setSelectionMode(true)} className={`${nextgenButtonClass} bg-slate-900 text-white hover:bg-slate-800`}>
          <MessageCircle size={17}/>Konfirmasi Pickup
        </button>}
      </>}/>
    {notice && <div role="status" className="rounded-xl border bg-white px-4 py-3 text-sm">{notice}</div>}
    <FilterCard><div className="mb-3 flex flex-wrap gap-2">
      <button onClick={() => preset(0)} className={nextgenNeutralButtonClass}>Hari Ini</button>
      <button onClick={() => preset(3)} className={nextgenNeutralButtonClass}>3 Hari Terakhir</button>
      <button onClick={() => preset(7)} className={nextgenNeutralButtonClass}>7 Hari Terakhir</button>
    </div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <input aria-label="Tanggal Mulai" type="date" value={startDate} onChange={event => { setPage(1); setStartDate(event.target.value); }} className={nextgenControlClass}/>
      <input aria-label="Tanggal Akhir" type="date" value={endDate} onChange={event => { setPage(1); setEndDate(event.target.value); }} className={nextgenControlClass}/>
      <select aria-label="Status JFS" value={filters.orderStatus} onChange={event => setFilter("orderStatus", event.target.value)} className={nextgenControlClass}>
        <option value="">Semua Status JFS</option>{result.filterOptions.statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <select aria-label="Metode" value={filters.sendName} onChange={event => setFilter("sendName", event.target.value)} className={nextgenControlClass}>
        <option value="">Semua Metode</option>{result.filterOptions.methods.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <select aria-label="Kurir Pickup" value={filters.pickupStaff} onChange={event => setFilter("pickupStaff", event.target.value)} className={nextgenControlClass}>
        <option value="">Semua Kurir Pickup</option>{result.filterOptions.pickupStaff.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <button onClick={reset} className={nextgenNeutralButtonClass}>Reset Filter</button>
    </div></FilterCard>
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard label="Total Resi" value={result.summary.totalWaybills.toLocaleString("id-ID")}/>
      <MetricCard label="Total Jadwal" value={result.summary.totalSchedules.toLocaleString("id-ID")}/>
      <MetricCard label="Nomor Tersedia" value={result.summary.validMaskedPhones.toLocaleString("id-ID")}/>
    </section>
    {selectionMode && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
      <span className="font-semibold text-blue-950">{selected.size} pickup dipilih</span>
      <div className="flex gap-2">
        <button disabled={confirming || selected.size === 0} onClick={() => void confirmSelected()} className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>
          {confirming ? <LoaderCircle className="animate-spin" size={17}/> : <MessageCircle size={17}/>}Kirim Konfirmasi
        </button>
        <button disabled={confirming} onClick={cancelSelection} className={nextgenNeutralButtonClass}><X size={17}/>Batal</button>
      </div>
    </div>}
    <TableCard><div className="overflow-x-auto"><table className="w-full min-w-[1940px] table-fixed text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
        {selectionMode && <th className="w-16 px-3 py-3">Pilih</th>}
        {[{ label: "No", width: "w-14" }, { label: "Waybill", width: "w-[140px]" },
          { label: "Waktu Input", width: "w-[155px]" }, { label: "Source", width: "w-[110px]" },
          { label: "Status JFS", width: "w-[170px]" }, { label: "Metode", width: "w-[125px]" },
          { label: "Pengirim", width: "w-[140px]" }, { label: "Perusahaan", width: "w-[130px]" },
          { label: "No. HP", width: "w-[120px]" }, { label: "Area Pengirim", width: "w-[160px]" },
          { label: "Alamat Pickup", width: "w-[300px]" }, { label: "Kurir Pickup", width: "w-[180px]" },
          { label: "Waktu Pickup", width: "w-[170px]" }, { label: "Berat", width: "w-20" },
          { label: "Status Konfirmasi", width: "w-[160px]" }]
          .map(item => <th key={item.label} className={`${item.width} px-3 py-3`}>{item.label}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={selectionMode ? 16 : 15} className="py-16 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin"/>Memuat data…</td></tr>
        : result.rows.length === 0 ? <tr><td colSpan={selectionMode ? 16 : 15} className="py-16 text-center text-slate-500">Tidak ada jadwal pickup pada filter ini.</td></tr>
        : result.rows.map((row, index) => <tr key={row.rowId} className={selected.has(row.rowId) ? "bg-blue-50/60" : "hover:bg-slate-50/70"}>
          {selectionMode && <td className="px-3 py-3 align-top"><input type="checkbox" aria-label={`Pilih ${row.waybill}`} checked={selected.has(row.rowId)} onChange={() => toggleRow(row.rowId)} className="size-4 rounded border-slate-300 text-blue-600"/></td>}
          <td className="px-3 py-3 align-top text-slate-500">{(page - 1) * result.pagination.pageSize + index + 1}</td>
          <td className="whitespace-nowrap px-3 py-3 align-top font-semibold text-slate-950">{row.waybill}</td>
          <td className="whitespace-nowrap px-3 py-3 align-top">{formatDateTime(row.inputTime, row.businessDate)}</td>
          <td className="whitespace-nowrap px-3 py-3 align-top font-medium">{row.source || "-"}</td>
          <td className="px-3 py-3 align-top"><span className="line-clamp-2">{row.statusCode ? `${row.statusCode} · ` : ""}{row.status || "—"}</span></td>
          <td className="whitespace-nowrap px-3 py-3 align-top">{row.sendName || "—"}</td><td className="px-3 py-3 align-top font-medium">{row.senderName || "—"}</td>
          <td className="px-3 py-3 align-top">{row.senderCompany || "—"}</td><td className="whitespace-nowrap px-3 py-3 align-top">{row.senderPhoneMasked || "—"}</td>
          <td className="px-3 py-3 align-top"><span className="line-clamp-2">{[row.senderCity, row.senderArea].filter(Boolean).join(" · ") || "—"}</span></td>
          <td className="px-3 py-3 align-top"><span className="line-clamp-2 leading-5" title={row.pickupAddressMasked || undefined}>{row.pickupAddressMasked || "—"}</span></td>
          <td className="overflow-hidden px-3 py-3 align-top"><span className="line-clamp-2 break-words leading-5" title={row.pickupStaff || undefined}>{row.pickupStaff || "Belum ada"}</span></td>
          <td className="whitespace-nowrap px-3 py-3 align-top">{formatDateTime(row.bestPickTime)}</td>
          <td className="whitespace-nowrap px-3 py-3 align-top">{row.weight.toLocaleString("id-ID")}</td>
          <td className="px-3 py-3 align-top"><span className="line-clamp-2">{row.pickupFailed ? row.pickFailReason || "Gagal pickup" : "Siap dikonfirmasi"}</span></td>
        </tr>)}</tbody>
    </table></div></TableCard>
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{result.pagination.total} pickup</span><div className="flex items-center gap-2">
        <button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} className={nextgenNeutralButtonClass}>Sebelumnya</button>
        <span>{page} / {Math.max(1, result.pagination.totalPages)}</span>
        <button disabled={page >= result.pagination.totalPages || loading} onClick={() => setPage(value => value + 1)} className={nextgenNeutralButtonClass}>Berikutnya</button>
      </div>
    </div>
  </div>;
}

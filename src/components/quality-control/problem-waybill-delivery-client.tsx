"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, LoaderCircle, MessageCircle, RefreshCw, ShieldAlert, X } from "lucide-react";
import {
  FilterCard,
  MetricCard,
  ModalCard,
  PageHeader,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";
import {
  buildProblemWaybillWhatsAppUrl,
  normalizeIndonesianPhone,
} from "@/modules/quality-control/problem-waybill-delivery-whatsapp";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type Row = {
  id: string;
  businessDate: string;
  waybill: string;
  courierName: string | null;
  status: string | null;
  receiverNameMasked: string | null;
  lastUpdatedAt: string;
};
type Detail = {
  waybill: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  senderName: string | null;
  senderPhone: string | null;
  lastScanSite: string | null;
  lastScanTime: string | null;
  currentStatus: string | null;
  problemReason: string | null;
};
type ListResult = {
  data: Row[];
  summary: { totalBelumDiterima: number; totalWaybill: number; totalCourier: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const emptyResult: ListResult = {
  data: [],
  summary: { totalBelumDiterima: 0, totalWaybill: 0, totalCourier: 0 },
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));

export function ProblemWaybillDeliveryClient({
  canSync,
  canViewSensitive,
}: {
  canSync: boolean;
  canViewSensitive: boolean;
}) {
  const [result, setResult] = useState(emptyResult);
  const [businessDate, setBusinessDate] = useState(jakartaOperationalDate);
  const [waybillInput, setWaybillInput] = useState("");
  const [courierInput, setCourierInput] = useState("");
  const [waybill, setWaybill] = useState("");
  const [courierName, setCourierName] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("businessDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedWaybill, setSelectedWaybill] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setWaybill(waybillInput.trim());
      setCourierName(courierInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [waybillInput, courierInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const query = new URLSearchParams({
        businessDate,
        waybill,
        courierName,
        page: String(page),
        pageSize: "20",
        sortBy,
        sortOrder,
      });
      const response = await fetch(`/api/quality-control/problem-waybill-delivery?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error();
      setResult(payload);
    } catch {
      setNotice("Data Problem Waybill Delivery tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [businessDate, courierName, page, sortBy, sortOrder, waybill]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function syncDispatch() {
    if (syncing) return;
    setSyncing(true);
    setNotice("");
    try {
      const response = await fetch("/api/delivery-settlement/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(businessDate ? { operationalDate: businessDate } : {}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error();
      const dispatch = payload.data?.dispatch ?? {};
      const successNotice = [
        "Sinkronisasi Dispatch berhasil:",
        `received ${dispatch.fetched ?? 0}`,
        `unique ${dispatch.unique ?? 0}`,
        `created ${dispatch.created ?? 0}`,
        `updated ${dispatch.updated ?? 0}`,
        `duplicate ignored ${dispatch.duplicateIgnored ?? 0}`,
        `inactive versions ${dispatch.inactiveVersions ?? 0}`,
      ].join(" · ");
      await load();
      setNotice(successNotice);
    } catch {
      setNotice("Sinkronisasi Dispatch gagal. Data lama tetap dipertahankan.");
    } finally {
      setSyncing(false);
    }
  }

  async function openDetail(targetWaybill: string) {
    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;
    setSelectedWaybill(targetWaybill);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(
        `/api/quality-control/problem-waybill-delivery/${encodeURIComponent(targetWaybill)}/detail`,
        { cache: "no-store", signal: controller.signal },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error();
      setDetail(payload.data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setDetailError("Detail waybill tidak dapat diambil.");
      }
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }

  function closeDetail() {
    detailAbort.current?.abort();
    detailAbort.current = null;
    setSelectedWaybill(null);
    setDetail(null);
    setDetailError("");
    setDetailLoading(false);
  }

  function openWhatsApp() {
    if (!detail?.receiverPhone) return;
    const url = buildProblemWaybillWhatsAppUrl({
      receiverName: detail.receiverName,
      receiverPhone: detail.receiverPhone,
      waybill: detail.waybill,
    });
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  }

  const whatsappValid = Boolean(normalizeIndonesianPhone(detail?.receiverPhone));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quality Control"
        title="Problem Waybill Delivery"
        description="Monitoring waybill aktif dengan status Belum diterima dan verifikasi kendala penerima."
        actions={
          <>
            <button className={nextgenNeutralButtonClass} disabled={loading || syncing} onClick={() => void load()}>
              <RefreshCw size={17} /> Refresh
            </button>
            {canSync && (
              <button className={`${nextgenButtonClass} bg-blue-600 text-white`} disabled={loading || syncing} onClick={() => void syncDispatch()}>
                {syncing ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />}
                {syncing ? "Menyinkronkan..." : "Sinkronkan Dispatch"}
              </button>
            )}
          </>
        }
      />
      {notice && <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{notice}</div>}
      <FilterCard>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input aria-label="Business Date" type="date" value={businessDate} onChange={(event) => { setPage(1); setBusinessDate(event.target.value); }} className={nextgenControlClass} />
          <input aria-label="Waybill" value={waybillInput} onChange={(event) => setWaybillInput(event.target.value)} placeholder="Cari waybill" className={nextgenControlClass} />
          <input aria-label="Nama Kurir" value={courierInput} onChange={(event) => setCourierInput(event.target.value)} placeholder="Cari nama kurir" className={nextgenControlClass} />
          <select aria-label="Urutkan" value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); }} className={nextgenControlClass}>
            <option value="businessDate">Business Date</option><option value="waybill">Waybill</option><option value="courierName">Nama Kurir</option><option value="lastUpdatedAt">Updated At</option>
          </select>
          <select aria-label="Arah urutan" value={sortOrder} onChange={(event) => { setPage(1); setSortOrder(event.target.value); }} className={nextgenControlClass}>
            <option value="desc">Terbaru</option><option value="asc">Terlama</option>
          </select>
        </div>
        <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Status: Belum diterima</span>
      </FilterCard>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Belum Diterima" value={result.summary.totalBelumDiterima.toLocaleString("id-ID")} />
        <MetricCard label="Total Waybill" value={result.summary.totalWaybill.toLocaleString("id-ID")} />
        <MetricCard label="Total Kurir" value={result.summary.totalCourier.toLocaleString("id-ID")} />
      </section>
      <TableCard footer={<div className="flex items-center justify-between"><span>{result.pagination.total} waybill</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Sebelumnya</button><span className="px-2 py-1.5">{page} / {Math.max(1, result.pagination.totalPages)}</span><button disabled={page >= result.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Berikutnya</button></div></div>}>
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Business Date","Waybill","Nama Kurir","Penerima","Status","Updated At","Aksi"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={7} className="py-14 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Memuat data…</td></tr> : result.data.length === 0 ? <tr><td colSpan={7} className="py-14 text-center text-slate-500"><ShieldAlert className="mx-auto mb-2"/>Tidak ada waybill berstatus Belum diterima pada tanggal ini.</td></tr> : result.data.map((row) => <tr key={row.id}><td className="px-4 py-3">{formatDate(row.businessDate)}</td><td className="px-4 py-3 font-semibold">{row.waybill}</td><td className="px-4 py-3">{row.courierName?.trim() || "Team Belum Terpetakan"}</td><td className="px-4 py-3">{row.receiverNameMasked ?? "—"}</td><td className="px-4 py-3"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{row.status}</span></td><td className="px-4 py-3">{formatDateTime(row.lastUpdatedAt)}</td><td className="px-4 py-3">{canViewSensitive ? <button onClick={() => void openDetail(row.waybill)} className="inline-flex items-center gap-1 font-semibold text-blue-600"><Eye size={16}/>Lihat Detail</button> : "—"}</td></tr>)}</tbody>
        </table></div>
      </TableCard>
      {selectedWaybill && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Detail Waybill"><ModalCard className="max-w-2xl">
        <div className="flex items-center justify-between border-b p-5"><h2 className="text-xl font-bold">Detail Waybill</h2><button aria-label="Tutup detail" onClick={closeDetail}><X/></button></div>
        <div className="p-5">{detailLoading ? <div className="py-12 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin"/>Mengambil detail…</div> : detailError ? <p className="rounded-xl bg-red-50 p-4 text-red-700">{detailError}</p> : detail && <dl className="grid gap-4 sm:grid-cols-2">{[
          ["Waybill", detail.waybill],["Nama Penerima",detail.receiverName],["Nomor HP",detail.receiverPhone],["Alamat",detail.receiverAddress],["Nama Pengirim",detail.senderName],["Nomor HP Pengirim",detail.senderPhone],["Status Terakhir",detail.currentStatus],["Lokasi Scan Terakhir",detail.lastScanSite],["Waktu Scan Terakhir",detail.lastScanTime],["Problem Reason",detail.problemReason],
        ].map(([label,value]) => <div key={label} className={label === "Alamat" ? "sm:col-span-2" : ""}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-900">{value || "—"}</dd></div>)}</dl>}</div>
        <div className="flex justify-end gap-3 border-t p-5">{detail && <button disabled={!whatsappValid} onClick={openWhatsApp} className={`${nextgenButtonClass} bg-emerald-600 text-white disabled:opacity-40`}><MessageCircle size={17}/>Chat WhatsApp</button>}<button onClick={closeDetail} className={nextgenNeutralButtonClass}>Tutup</button></div>
      </ModalCard></div>}
    </div>
  );
}

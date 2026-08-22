"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle, MessageCircle, RefreshCw } from "lucide-react";
import {
  FilterCard, MetricCard, PageHeader, TableCard, nextgenButtonClass,
  nextgenControlClass, nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaDateRange } from "@/lib/dates/jakarta-date";
import {
  buildPickupMessage, buildPickupWhatsAppUrl, normalizePickupPhone,
} from "@/modules/quality-control/pickup-scheduling-whatsapp";

type Order = {
  id: string; waybill: string; source: string | null; goodsName: string | null;
  weight: number; status: string | null; statusCode: number | null; businessDate: string; ageLabel: string;
  inputTime: string | null; sendName: string | null; senderCompany: string | null;
  senderCity: string | null; senderArea: string | null; pickupStaff: string | null;
  pickupNetwork: string | null; assigned: boolean; pickupFailed: boolean;
  pickFailReason: string | null; bestPickTime: string | null;
};
type Group = {
  groupId: string; sellerName: string | null; senderPhoneMasked: string | null;
  pickupAddressMasked: string | null; orders: Order[];
};
type Result = {
  summary: { totalWaybills: number; totalGroups: number; validMaskedPhones: number };
  groups: Group[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type SenderDetail = {
  waybill: string; senderName: string | null; senderMobilePhone: string | null;
  senderCityName: string | null; status: "success" | "failed"; errorCode: string | null;
};
type GroupDetail = {
  requestId: string; groupId: string; senderName: string | null;
  senderMobilePhone: string | null; senderCityName: string | null;
  outletCode: string | null; details: SenderDetail[];
  orders: Array<{ waybill: string; source: string | null; goodsName: string | null }>;
};
const empty: Result = {
  summary: { totalWaybills: 0, totalGroups: 0, validMaskedPhones: 0 },
  groups: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
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

export function PickupSchedulingClient({ canSync, canConfirm }: { canSync: boolean; canConfirm: boolean }) {
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [inputs, setInputs] = useState({
    waybill: "", senderName: "", sourcePlatform: "", orderStatus: "", sendName: "",
    pickupNetwork: "", pickupStaff: "", assignment: "ALL", pickupFailure: "ALL",
    senderCity: "", senderArea: "",
  });
  const [filters, setFilters] = useState(inputs);
  const [result, setResult] = useState(empty);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const groupDetailCache = useRef(new Map<string, GroupDetail>());
  const detailRequests = useRef(new Map<string, Promise<GroupDetail>>());
  const confirmationLocks = useRef(new Set<string>());
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setFilters(inputs);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [inputs]);

  const load = useCallback(async () => {
    if (!validRange(startDate, endDate)) {
      setNotice("Rentang tanggal tidak valid.");
      return;
    }
    setLoading(true); setNotice("");
    try {
      const query = new URLSearchParams({
        startDate, endDate, ...filters, page: String(page), pageSize: "20",
      });
      const response = await fetch(`/api/quality-control/pickup-scheduling?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setNotice("Data Penjadwalan Pickup tidak dapat dimuat."); }
    finally { setLoading(false); }
  }, [endDate, filters, page, startDate]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function sync() {
    if (syncing) return;
    if (!validRange(startDate, endDate)) {
      const start = Date.parse(`${startDate}T00:00:00.000Z`);
      const end = Date.parse(`${endDate}T00:00:00.000Z`);
      setNotice(Number.isFinite(start) && Number.isFinite(end) && end - start > 30 * 86_400_000
        ? "Rentang maksimal 31 hari."
        : "Rentang tanggal tidak valid.");
      return;
    }
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
    }
    finally { setSyncing(false); }
  }

  const loadGroupDetail = useCallback(async (group: Group) => {
    const groupCacheKey = `${group.groupId}:${startDate}:${endDate}:${group.orders.map((order) => order.waybill.trim()).join("|")}`;
    const cached = groupDetailCache.current.get(groupCacheKey);
    if (cached) return cached;
    const active = detailRequests.current.get(groupCacheKey);
    if (active) return active;

    const request = (async () => {
      const query = new URLSearchParams({ startDate, endDate });
      const response = await fetch(`/api/quality-control/pickup-scheduling/groups/${group.groupId}/detail?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as GroupDetail | { error?: { code?: string } } | null;
      if (!response.ok || !body || !("details" in body) || !Array.isArray(body.details)) {
        throw new Error(response.status === 404 ? "GROUP_NOT_FOUND" : "DETAIL_FAILED");
      }
      const detail = body as GroupDetail;
      groupDetailCache.current.set(groupCacheKey, detail);
      return detail;
    })();
    detailRequests.current.set(groupCacheKey, request);
    try {
      return await request;
    } finally { detailRequests.current.delete(groupCacheKey); }
  }, [endDate, startDate]);

  async function confirm(group: Group) {
    if (confirmationLocks.current.has(group.groupId)) return;
    confirmationLocks.current.add(group.groupId);
    setConfirming(group.groupId); setNotice("");
    try {
      const detail = await loadGroupDetail(group);
      if (!detail.senderMobilePhone) throw new Error("PHONE_UNAVAILABLE");
      if (!normalizePickupPhone(detail.senderMobilePhone)) throw new Error("PHONE_INVALID");
      const message = buildPickupMessage({
        customerName: detail.senderName, outletCode: detail.outletCode, orders: detail.orders,
      });
      const url = buildPickupWhatsAppUrl(detail.senderMobilePhone, message);
      if (!url) throw new Error("PHONE_INVALID");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch (error) {
      const code = error instanceof Error ? error.message : "DETAIL_FAILED";
      setNotice(code === "PHONE_UNAVAILABLE" ? "Nomor WhatsApp pengirim tidak tersedia."
        : code === "PHONE_INVALID" ? "Nomor WhatsApp tidak valid."
        : "Detail JFS tidak dapat diambil. Coba lagi.");
    } finally {
      confirmationLocks.current.delete(group.groupId);
      setConfirming(null);
    }
  }

  const reset = () => {
    const blank = { waybill: "", senderName: "", sourcePlatform: "", orderStatus: "", sendName: "",
      pickupNetwork: "", pickupStaff: "", assignment: "ALL", pickupFailure: "ALL", senderCity: "", senderArea: "" };
    setInputs(blank); setFilters(blank);
  };
  const preset = (daysBack: number) => {
    const range = jakartaDateRange(daysBack);
    setPage(1); setStartDate(range.startDate); setEndDate(range.endDate);
  };
  const toggle = (group: Group) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(group.groupId)) next.delete(group.groupId);
    else next.add(group.groupId);
    return next;
  });

  return <div className="space-y-6">
    <PageHeader eyebrow="Quality Control" title="Penjadwalan Pickup"
      description="Pengelolaan jadwal pickup dan konfirmasi kesiapan customer."
      actions={<>
        <button disabled={loading || syncing} onClick={() => void load()} className={nextgenNeutralButtonClass}><RefreshCw size={17}/>Refresh</button>
        {canSync && <button disabled={loading || syncing} onClick={() => void sync()} className={nextgenButtonClass}>
          {syncing ? <LoaderCircle className="animate-spin" size={17}/> : <RefreshCw size={17}/>}Sinkronkan Data
        </button>}
      </>}/>
    {notice && <div role="status" className="rounded-xl border bg-white px-4 py-3 text-sm">{notice}</div>}
    <FilterCard><div className="mb-3 flex flex-wrap gap-2">
      <button onClick={() => preset(0)} className={nextgenNeutralButtonClass}>Hari Ini</button>
      <button onClick={() => preset(3)} className={nextgenNeutralButtonClass}>3 Hari Terakhir</button>
      <button onClick={() => preset(7)} className={nextgenNeutralButtonClass}>7 Hari Terakhir</button>
    </div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <input aria-label="Tanggal Mulai" type="date" value={startDate} onChange={(event) => { setPage(1); setStartDate(event.target.value); }} className={nextgenControlClass}/>
      <input aria-label="Tanggal Akhir" type="date" value={endDate} onChange={(event) => { setPage(1); setEndDate(event.target.value); }} className={nextgenControlClass}/>
      <input aria-label="Search Resi" placeholder="Search Resi" value={inputs.waybill} onChange={(event) => setInputs({ ...inputs, waybill: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Search Pengirim" placeholder="Search Pengirim" value={inputs.senderName} onChange={(event) => setInputs({ ...inputs, senderName: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Search Source" placeholder="Search Source/Platform" value={inputs.sourcePlatform} onChange={(event) => setInputs({ ...inputs, sourcePlatform: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Status JFS" placeholder="Status JFS / kode" value={inputs.orderStatus} onChange={(event) => setInputs({ ...inputs, orderStatus: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Metode Pickup" placeholder="Metode Pickup" value={inputs.sendName} onChange={(event) => setInputs({ ...inputs, sendName: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Network Pickup" placeholder="Network Pickup" value={inputs.pickupNetwork} onChange={(event) => setInputs({ ...inputs, pickupNetwork: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Kurir Pickup" placeholder="Kurir Pickup" value={inputs.pickupStaff} onChange={(event) => setInputs({ ...inputs, pickupStaff: event.target.value })} className={nextgenControlClass}/>
      <select aria-label="Assignment" value={inputs.assignment} onChange={(event) => setInputs({ ...inputs, assignment: event.target.value })} className={nextgenControlClass}>
        <option value="ALL">Semua Assignment</option><option value="ASSIGNED">Sudah Ada Kurir</option><option value="UNASSIGNED">Belum Ada Kurir</option>
      </select>
      <select aria-label="Pickup Failure" value={inputs.pickupFailure} onChange={(event) => setInputs({ ...inputs, pickupFailure: event.target.value })} className={nextgenControlClass}>
        <option value="ALL">Semua Pickup</option><option value="FAILED">Gagal Pickup</option><option value="NOT_FAILED">Tidak Gagal</option>
      </select>
      <input aria-label="Kota Pengirim" placeholder="Kota Pengirim" value={inputs.senderCity} onChange={(event) => setInputs({ ...inputs, senderCity: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Area Pengirim" placeholder="Area Pengirim" value={inputs.senderArea} onChange={(event) => setInputs({ ...inputs, senderArea: event.target.value })} className={nextgenControlClass}/>
      <button onClick={reset} className={nextgenNeutralButtonClass}>Reset Filter</button>
    </div></FilterCard>
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard label="Total Resi" value={result.summary.totalWaybills.toLocaleString("id-ID")}/>
      <MetricCard label="Total Jadwal" value={result.summary.totalGroups.toLocaleString("id-ID")}/>
      <MetricCard label="Nomor Tersedia" value={result.summary.validMaskedPhones.toLocaleString("id-ID")}/>
    </section>
    <div className="space-y-3">
      {loading ? <div className="py-16 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin"/>Memuat data…</div>
        : result.groups.map((group, index) => <section key={group.groupId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-4 p-4">
            <span className="w-8 text-slate-500">{index + 1}</span>
            <button aria-expanded={expanded.has(group.groupId)} onClick={() => toggle(group)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {expanded.has(group.groupId) ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
              <span><strong>{group.sellerName || "Pengirim tidak tersedia"}</strong><span className="ml-3 text-sm text-slate-500">{group.orders.length} resi · {group.senderPhoneMasked || "nomor tersensor"}</span></span>
            </button>
            {canConfirm && <button disabled={confirming === group.groupId} onClick={() => void confirm(group)} className={nextgenButtonClass}>
              {confirming === group.groupId ? <LoaderCircle className="animate-spin" size={17}/> : <MessageCircle size={17}/>}Konfirmasi Pickup
            </button>}
          </div>
          {expanded.has(group.groupId) && <div className="border-t border-slate-100 p-4">
            <p className="mb-3 text-sm text-slate-500">{group.pickupAddressMasked || "Alamat pickup tersensor tidak tersedia."}</p>
            <TableCard><div className="overflow-x-auto"><table className="w-full min-w-[1700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["No","Waybill","Waktu Input","Source","Status JFS","Metode","Pengirim","Perusahaan","No. Pengirim","Area Pengirim","Alamat Pickup","Kurir Pickup","Waktu Pickup Terbaik","Berat","Gagal Pickup"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
              <tbody className="divide-y">{group.orders.map((order, orderIndex) => <tr key={order.id}>
                <td className="px-4 py-3">{orderIndex + 1}</td><td className="px-4 py-3 font-semibold">{order.waybill}</td>
                <td className="px-4 py-3">{order.inputTime ? new Date(order.inputTime).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : order.businessDate}</td>
                <td className="px-4 py-3">{order.source || "—"}</td><td className="px-4 py-3">{order.statusCode ? `${order.statusCode} · ` : ""}{order.status || "—"}</td>
                <td className="px-4 py-3">{order.sendName || "—"}</td><td className="px-4 py-3">{group.sellerName || "—"}</td>
                <td className="px-4 py-3">{order.senderCompany || "—"}</td><td className="px-4 py-3">{group.senderPhoneMasked || "—"}</td>
                <td className="px-4 py-3">{[order.senderCity, order.senderArea].filter(Boolean).join(" · ") || "—"}</td>
                <td className="max-w-[320px] whitespace-normal px-4 py-3">{group.pickupAddressMasked || "—"}</td>
                <td className="px-4 py-3">{order.pickupStaff || "Belum ada"}</td><td className="px-4 py-3">{order.bestPickTime ? new Date(order.bestPickTime).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "—"}</td>
                <td className="px-4 py-3">{order.weight.toLocaleString("id-ID")}</td><td className="px-4 py-3">{order.pickupFailed ? order.pickFailReason || "Ya" : "Tidak"}</td>
              </tr>)}</tbody>
            </table></div></TableCard>
          </div>}
        </section>)}
    </div>
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{result.pagination.total} grup</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className={nextgenNeutralButtonClass}>Sebelumnya</button>
        <span>{page} / {Math.max(1, result.pagination.totalPages)}</span>
        <button disabled={page >= result.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className={nextgenNeutralButtonClass}>Berikutnya</button>
      </div>
    </div>
  </div>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle, MessageCircle, RefreshCw } from "lucide-react";
import {
  FilterCard, MetricCard, PageHeader, TableCard, nextgenButtonClass,
  nextgenControlClass, nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { buildPickupMessage, buildPickupWhatsAppUrl } from "@/modules/quality-control/pickup-scheduling-whatsapp";

type Order = { id: string; waybill: string; source: string | null; goodsName: string | null; weight: number; status: string | null };
type Group = {
  groupId: string; sellerName: string | null; senderPhoneMasked: string | null;
  pickupAddressMasked: string | null; orders: Order[];
};
type Result = {
  summary: { totalWaybills: number; totalGroups: number; validMaskedPhones: number };
  groups: Group[];
};
const empty: Result = { summary: { totalWaybills: 0, totalGroups: 0, validMaskedPhones: 0 }, groups: [] };

export function PickupSchedulingClient({ canSync, canConfirm }: { canSync: boolean; canConfirm: boolean }) {
  const [businessDate, setBusinessDate] = useState(jakartaOperationalDate);
  const [inputs, setInputs] = useState({ waybill: "", sender: "", source: "" });
  const [filters, setFilters] = useState(inputs);
  const [result, setResult] = useState(empty);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(inputs), 300);
    return () => window.clearTimeout(timer);
  }, [inputs]);

  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const query = new URLSearchParams({ businessDate, ...filters });
      const response = await fetch(`/api/quality-control/pickup-scheduling?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setNotice("Data Penjadwalan Pickup tidak dapat dimuat."); }
    finally { setLoading(false); }
  }, [businessDate, filters]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function sync() {
    if (syncing) return;
    setSyncing(true); setNotice("");
    try {
      const response = await fetch("/api/quality-control/pickup-scheduling/sync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessDate }),
      });
      if (!response.ok) throw new Error();
      await load();
      setNotice("Sinkronisasi daftar pickup selesai.");
    } catch { setNotice("Sinkronisasi gagal. Data lama tetap tersedia."); }
    finally { setSyncing(false); }
  }

  async function confirm(group: Group) {
    if (confirming) return;
    setConfirming(group.groupId); setNotice("");
    try {
      const query = new URLSearchParams({ businessDate });
      const response = await fetch(`/api/quality-control/pickup-scheduling/groups/${group.groupId}/detail?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const detail = await response.json();
      const message = buildPickupMessage({
        customerName: detail.customerName, outletCode: detail.outletCode, orders: detail.orders,
      });
      const url = buildPickupWhatsAppUrl(detail.customerPhone, message);
      if (!url) throw new Error();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch { setNotice("Detail pengirim atau nomor WhatsApp tidak tersedia."); }
    finally { setConfirming(null); }
  }

  const reset = () => {
    const blank = { waybill: "", sender: "", source: "" };
    setInputs(blank); setFilters(blank);
  };
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
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
    <FilterCard><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <input aria-label="Business Date" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} className={nextgenControlClass}/>
      <input aria-label="Search Resi" placeholder="Search Resi" value={inputs.waybill} onChange={(event) => setInputs({ ...inputs, waybill: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Search Pengirim" placeholder="Search Pengirim" value={inputs.sender} onChange={(event) => setInputs({ ...inputs, sender: event.target.value })} className={nextgenControlClass}/>
      <input aria-label="Search Source" placeholder="Search Source/Platform" value={inputs.source} onChange={(event) => setInputs({ ...inputs, source: event.target.value })} className={nextgenControlClass}/>
      <button onClick={reset} className={nextgenNeutralButtonClass}>Reset Filter</button>
    </div></FilterCard>
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard label="Total Resi" value={result.summary.totalWaybills.toLocaleString("id-ID")}/>
      <MetricCard label="Total Grup Pengirim" value={result.summary.totalGroups.toLocaleString("id-ID")}/>
      <MetricCard label="Nomor Valid" value={result.summary.validMaskedPhones.toLocaleString("id-ID")}/>
    </section>
    <div className="space-y-3">
      {loading ? <div className="py-16 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin"/>Memuat data…</div>
        : result.groups.map((group, index) => <section key={group.groupId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-4 p-4">
            <span className="w-8 text-slate-500">{index + 1}</span>
            <button aria-expanded={expanded.has(group.groupId)} onClick={() => toggle(group.groupId)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {expanded.has(group.groupId) ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
              <span><strong>{group.sellerName || "Pengirim tidak tersedia"}</strong><span className="ml-3 text-sm text-slate-500">{group.orders.length} resi · {group.senderPhoneMasked || "nomor tersensor"}</span></span>
            </button>
            {canConfirm && <button disabled={confirming !== null} onClick={() => void confirm(group)} className={nextgenButtonClass}>
              {confirming === group.groupId ? <LoaderCircle className="animate-spin" size={17}/> : <MessageCircle size={17}/>}Konfirmasi Pickup
            </button>}
          </div>
          {expanded.has(group.groupId) && <div className="border-t border-slate-100 p-4">
            <p className="mb-3 text-sm text-slate-500">{group.pickupAddressMasked || "Alamat pickup tersensor tidak tersedia."}</p>
            <TableCard><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["No","Nomor Resi","Isi Barang","Platform","Berat","Status"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
              <tbody className="divide-y">{group.orders.map((order, orderIndex) => <tr key={order.id}>
                <td className="px-4 py-3">{orderIndex + 1}</td><td className="px-4 py-3 font-semibold">{order.waybill}</td>
                <td className="px-4 py-3">{order.goodsName || "—"}</td><td className="px-4 py-3">{order.source || "—"}</td>
                <td className="px-4 py-3">{order.weight.toLocaleString("id-ID")}</td><td className="px-4 py-3">{order.status || "—"}</td>
              </tr>)}</tbody>
            </table></div></TableCard>
          </div>}
        </section>)}
    </div>
  </div>;
}

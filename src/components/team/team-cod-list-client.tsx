"use client";

import { AlertCircle, BadgeDollarSign, CheckCircle2, Search, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Method = "CASH" | "TRANSFER";
type Package = {
  waybill: string; recipientName: string | null; address: string | null;
  type: "COD" | "DFOD"; amount: number; method: Method | null; checked: boolean;
};
type Data = {
  businessDate: string;
  packages: Package[];
  summary: { total: number; cash: number; transfer: number; unfinished: number; packageCount: number; completedCount: number; unfinishedCount: number };
};

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(value);

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: Data } | null;
  if (!response.ok || !body?.success || !body.data) throw new Error("Data COD List gagal disimpan. Silakan coba lagi.");
  return body.data;
}

export function TeamCodListClient({ employeeName, outletCode, initialDate }: {
  employeeName: string; outletCode: string; initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const load = useCallback(async (selectedDate: string) => {
    setLoading(true); setError("");
    try { setData(await request(`/api/team/cod-list?date=${encodeURIComponent(selectedDate)}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "COD List gagal dimuat."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  const save = async (item: Package, next: Pick<Package, "method" | "checked">) => {
    if (saving.has(item.waybill)) return;
    setSaving((current) => new Set(current).add(item.waybill)); setError("");
    try {
      setData(await request("/api/team/cod-list", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationalDate: date, waybill: item.waybill, ...next }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Data COD List gagal disimpan.");
      await load(date);
    } finally {
      setSaving((current) => { const nextSet = new Set(current); nextSet.delete(item.waybill); return nextSet; });
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleUpperCase("id-ID");
    if (!needle) return data?.packages ?? [];
    return (data?.packages ?? []).filter((item) =>
      item.waybill.toLocaleUpperCase("id-ID").includes(needle) ||
      (item.recipientName ?? "").toLocaleUpperCase("id-ID").includes(needle)
    );
  }, [data, query]);

  return <div className="space-y-5">
    <header>
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Checklist Internal</p>
      <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">COD List</h1>
      <p className="mt-1 text-sm font-semibold text-slate-500">{employeeName} · Outlet {outletCode}</p>
    </header>

    <label className="block rounded-[20px] border border-slate-200 bg-white p-4 text-xs font-extrabold text-slate-700 shadow-sm">
      Tanggal operasional
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-900 outline-none focus:border-blue-500" />
    </label>

    {error && <div role="alert" className="flex gap-2 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle size={18} />{error}</div>}

    <section className="grid grid-cols-2 gap-3" aria-label="Ringkasan COD List">
      <Summary label="Total COD / DFOD" value={data?.summary.total ?? 0} icon={BadgeDollarSign} />
      <Summary label="Tunai" value={data?.summary.cash ?? 0} icon={WalletCards} />
      <Summary label="Transfer" value={data?.summary.transfer ?? 0} icon={WalletCards} />
      <Summary label="Belum Selesai" value={data?.summary.unfinished ?? 0} icon={AlertCircle} />
    </section>
    <p className="text-center text-xs font-bold text-slate-500">Total {data?.summary.packageCount ?? 0} paket · Selesai {data?.summary.completedCount ?? 0} · Belum {data?.summary.unfinishedCount ?? 0}</p>

    <label className="relative block">
      <Search aria-hidden="true" className="absolute left-3 top-3.5 text-slate-400" size={18} />
      <span className="sr-only">Cari resi atau penerima</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari resi / nama penerima" className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-base outline-none focus:border-blue-500" />
    </label>

    {loading ? <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">Memuat COD List…</div>
      : filtered.length === 0 ? <div className="rounded-[20px] border border-slate-200 bg-white p-7 text-center"><BadgeDollarSign className="mx-auto text-slate-400" size={34} /><p className="mt-2 text-sm font-extrabold text-slate-800">Tidak ada paket COD/DFOD pada tanggal ini.</p><p className="mt-1 text-xs text-slate-500">Total Rp0</p></div>
      : <section className="space-y-3" aria-label="Paket COD dan DFOD">{filtered.map((item) => {
        const busy = saving.has(item.waybill);
        return <article key={item.waybill} className={`rounded-[20px] border bg-white p-4 shadow-sm ${item.checked ? "border-emerald-200" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-sm font-black text-slate-950">{item.waybill}</p><p className="mt-1 truncate text-xs font-bold text-slate-700">{item.recipientName ?? "Penerima tidak tersedia"}</p><p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.address ?? "Alamat tidak tersedia"}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">{item.type}</span></div>
          <p className="mt-3 text-lg font-black text-slate-950">{rupiah(item.amount)}</p>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3 border-t border-slate-100 pt-3">
            <label className="text-xs font-extrabold text-slate-600">Metode
              <select aria-label={`Metode ${item.waybill}`} value={item.method ?? ""} disabled={busy} onChange={(event) => { const method = event.target.value as Method | ""; void save(item, { method: method || null, checked: method ? item.checked : false }); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-900 disabled:opacity-60"><option value="">Pilih Metode</option><option value="CASH">Tunai</option><option value="TRANSFER">Transfer</option></select>
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-extrabold text-slate-700"><input aria-label={`Selesai ${item.waybill}`} type="checkbox" checked={item.checked} disabled={!item.method || busy} onChange={(event) => void save(item, { method: item.method, checked: event.target.checked })} className="size-5 accent-blue-600" /><CheckCircle2 size={17} />Selesai</label>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">Checklist internal · tidak mengubah status JFS</p>
        </article>;
      })}</section>}
  </div>;
}

function Summary({ label, value, icon: Icon }: { label: string; value: number; icon: typeof BadgeDollarSign }) {
  return <div className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm"><div className="flex items-center gap-2 text-slate-500"><Icon size={17} /><span className="text-[10px] font-black uppercase tracking-wide">{label}</span></div><p className="mt-2 truncate text-base font-black text-slate-950">{rupiah(value)}</p></div>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, LoaderCircle, PackageCheck, QrCode, RefreshCw, Search, Truck, X } from "lucide-react";
import { MetricCard } from "@/components/ui";
import {
  jakartaOperationalDate,
  resolveJakartaOperationalDate,
} from "@/lib/dates/jakarta-date";
import {
  addTransferRow,
  buildTransferPayload,
  calculateTransferDraft,
  loadExistingTransfers,
  removeTransferRow,
  rupiahDigits,
} from "./delivery-transfer-form";

type Row = {
  id: string; updatedAt: string; operationalDate: string; courierName: string;
  dfodAmount: string; codCashAmount: string; codCashOnlyAmount: string;
  codQrisAmount: string; totalSettlement: string;
  cashPaidAmount: string; transferPaidAmount: string; totalReceived: string;
  outstandingAmount: string; overpaidAmount: string;
  paymentStatus: "UNCLEARED" | "CLEAR" | "OVERPAID";
  paymentMethodSummary: "UNPAID" | "CASH" | "TRANSFER" | "CASH_TRANSFER";
  note: string | null; transfers: Array<{ sequence: number; amount: string }>;
};

type Summary = {
  totalSettlement: string; totalCashReceived: string; totalTransferReceived: string;
  totalOutstanding: string; totalCod: string; totalCodQris: string; totalDfod: string; courierCount: number;
  clearCount: number; unclearedCount: number; overpaidCount: number;
};

const emptySummary: Summary = { totalSettlement: "0", totalCashReceived: "0", totalTransferReceived: "0", totalOutstanding: "0", totalCod: "0", totalCodQris: "0", totalDfod: "0", courierCount: 0, clearCount: 0, unclearedCount: 0, overpaidCount: 0 };
const money = (value: string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));

export function DeliverySettlementClient({ outletCode }: { outletCode: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [operationalDate, setOperationalDate] = useState(jakartaOperationalDate);
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [cash, setCash] = useState("0");
  const [transfers, setTransfers] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [adjustmentStatus, setAdjustmentStatus] = useState<"BELUM_BAYAR" | "SUDAH_BAYAR">("BELUM_BAYAR");
  const [adjustmentError, setAdjustmentError] = useState("");
  const [confirmCancellation, setConfirmCancellation] = useState(false);

  const query = useMemo(() => new URLSearchParams({ page: String(page), pageSize: "25", operationalDate, search, paymentStatus, paymentMethod }).toString(), [page, operationalDate, search, paymentStatus, paymentMethod]);
  const load = useCallback(async (queryOverride?: string) => {
    setLoading(true);
    try {
      const [listResponse, runResponse] = await Promise.all([
        fetch(`/api/delivery-settlement?${queryOverride ?? query}`, { cache: "no-store" }),
        fetch("/api/delivery-settlement/runs/latest", { cache: "no-store" }),
      ]);
      if (!listResponse.ok || !runResponse.ok) throw new Error();
      const list = await listResponse.json();
      const run = await runResponse.json();
      setRows(list.data); setSummary(list.summary); setPagination(list.pagination);
      setLastSync(run.data?.completedAt ?? null);
    } catch {
      setNotice({ tone: "error", text: "Data Delivery Settlement belum dapat dimuat." });
    } finally { setLoading(false); }
  }, [query]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function sync() {
    if (syncing) return;
    setSyncing(true); setNotice(null);
    const syncDate = resolveJakartaOperationalDate(operationalDate);
    const usedFallbackDate = !operationalDate;
    if (usedFallbackDate) {
      setOperationalDate(syncDate);
      setPage(1);
      setSelected(null);
    }
    try {
      const response = await fetch("/api/delivery-settlement/sync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationalDate: syncDate }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error();
      const cod = body.data?.cod ?? {};
      const successText = [
        "Delivery Settlement berhasil disinkronkan:",
        `diterima ${cod.fetched ?? 0}`,
        `unik ${cod.unique ?? 0}`,
        `dibuat ${cod.created ?? 0}`,
        `diperbarui ${cod.updated ?? 0}`,
        `duplikat diabaikan ${cod.duplicateIgnored ?? 0}`,
      ].join(" · ");
      if (usedFallbackDate) {
        const refreshedQuery = new URLSearchParams({
          page: "1",
          pageSize: "25",
          operationalDate: syncDate,
          search,
          paymentStatus,
          paymentMethod,
        }).toString();
        await load(refreshedQuery);
      } else {
        await load();
      }
      setNotice({ tone: "success", text: successText });
    } catch { setNotice({ tone: "error", text: "Sinkronisasi gagal. Data lama tetap dipertahankan." }); }
    finally { setSyncing(false); }
  }

  function open(row: Row) {
    setSelected(row); setCash(row.cashPaidAmount); setNote(row.note ?? "");
    setTransfers(loadExistingTransfers(row.transfers));
    setAdjustmentStatus(Number(row.totalReceived) > 0 ? "SUDAH_BAYAR" : "BELUM_BAYAR");
    setAdjustmentError("");
    setConfirmCancellation(false);
  }

  function addTransfer() {
    setTransfers(addTransferRow);
  }

  function removeTransfer(index: number) {
    setTransfers((current) => removeTransferRow(current, index));
  }

  async function save() {
    if (!selected || saving) return;
    const cancellingExistingPayment =
      adjustmentStatus === "BELUM_BAYAR" && Number(selected.totalReceived) > 0;
    if (cancellingExistingPayment && !note.trim()) {
      setAdjustmentError("Alasan pembatalan wajib diisi.");
      return;
    }
    if (cancellingExistingPayment && !confirmCancellation) {
      setConfirmCancellation(true);
      return;
    }
    setSaving(true); setNotice(null);
    try {
      const response = await fetch(`/api/delivery-settlement/${selected.id}/adjustment`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(), status: adjustmentStatus,
          cashAmount: adjustmentStatus === "BELUM_BAYAR" ? "0" : rupiahDigits(cash),
          transfers: adjustmentStatus === "BELUM_BAYAR" ? [] : buildTransferPayload(transfers),
          note: note || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setSelected(null); setConfirmCancellation(false);
      setNotice({ tone: "success", text: cancellingExistingPayment ? "Pembayaran Delivery berhasil dibatalkan. Settlement kembali berstatus Belum Bayar." : "Setoran kurir berhasil disimpan." }); await load();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Penyesuaian gagal." }); }
    finally { setSaving(false); }
  }

  const draft = calculateTransferDraft(selected?.totalSettlement ?? "0", cash, transfers);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-semibold text-blue-600">Settlement Center</p><h1 className="mt-1 text-3xl font-bold text-slate-950">Delivery Settlement</h1><p className="mt-2 text-slate-600">Pantau kewajiban dan pembayaran setoran harian kurir.</p></div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Outlet <b>{outletCode}</b><br />Sync terakhir: {lastSync ? dateTime(lastSync) : "Belum ada"}</div>
    </div>
    {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[
        ["Total Setoran", summary.totalSettlement, `${summary.courierCount} kurir · QRIS ${money(summary.totalCodQris)}`],
        ["Total Tunai", summary.totalCashReceived, `${summary.clearCount} clear`],
        ["Total Transfer", summary.totalTransferReceived, `${summary.overpaidCount} lebih bayar`],
        ["Belum Bayar", summary.totalOutstanding, `${summary.unclearedCount} belum clear`],
      ].map(([label, value, info]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{money(value as string)}</p><p className="mt-1 text-xs text-slate-500">{info}</p></div>)}
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MetricCard label={<span className="flex items-center gap-2"><Banknote size={17} />Total COD</span>} value={money(summary.totalCod)} />
      <MetricCard label={<span className="flex items-center gap-2"><QrCode size={17} />Total COD QRIS</span>} value={money(summary.totalCodQris)} />
      <MetricCard label={<span className="flex items-center gap-2"><PackageCheck size={17} />Total DFOD</span>} value={money(summary.totalDfod)} />
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <input aria-label="Tanggal operasional" type="date" value={operationalDate} onChange={(event) => { setNotice(null); setSelected(null); setPage(1); setOperationalDate(event.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input aria-label="Cari nama kurir" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Cari nama kurir" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm" /></label>
        <select aria-label="Status pembayaran" value={paymentStatus} onChange={(event) => { setPage(1); setPaymentStatus(event.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Semua status</option><option value="UNCLEARED">Belum Clear</option><option value="CLEAR">Clear</option><option value="OVERPAID">Lebih Bayar</option></select>
        <select aria-label="Metode pembayaran" value={paymentMethod} onChange={(event) => { setPage(1); setPaymentMethod(event.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Semua metode</option><option value="UNPAID">Belum Ada Pembayaran</option><option value="CASH">Tunai</option><option value="TRANSFER">Transfer</option><option value="CASH_TRANSFER">Tunai + Transfer</option></select>
        <button disabled={syncing} onClick={() => void sync()} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{syncing ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />}Sinkronkan</button>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Waktu Diperbarui","Tanggal","Nama Kurir","DFOD","COD Tunai","COD QRIS","Total Setoran","Bayar Tunai","Total Transfer","Total Diterima","Belum Bayar","Status","Aksi"].map((item) => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={13} className="py-14 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin" />Memuat data…</td></tr> : rows.length === 0 ? <tr><td colSpan={13} className="py-14 text-center text-slate-500"><Truck className="mx-auto mb-2" />Belum ada Delivery Settlement.</td></tr> : rows.map((row) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-4 py-3">{dateTime(row.updatedAt)}</td><td className="px-4 py-3">{date(row.operationalDate)}</td><td className="px-4 py-3 font-semibold">{row.courierName}</td>{[row.dfodAmount,row.codCashOnlyAmount,row.codQrisAmount,row.totalSettlement,row.cashPaidAmount,row.transferPaidAmount,row.totalReceived,row.outstandingAmount].map((amount, index) => <td key={index} className="px-4 py-3 tabular-nums">{money(amount)}</td>)}<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.paymentStatus === "CLEAR" ? "bg-emerald-100 text-emerald-700" : row.paymentStatus === "OVERPAID" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{row.paymentStatus === "CLEAR" ? "Clear" : row.paymentStatus === "OVERPAID" ? "Lebih Bayar" : "Belum Clear"}</span></td><td className="px-4 py-3"><button onClick={() => open(row)} className="font-semibold text-blue-600 hover:text-blue-800">Penyesuaian</button></td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600"><span>{pagination.total} transaksi</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Sebelumnya</button><span className="px-2 py-1.5">{page} / {Math.max(1, pagination.totalPages)}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Berikutnya</button></div></div>
    </div>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><div role="dialog" aria-modal="true" aria-label="Setor Kurir" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b px-6 py-5"><div><p className="text-sm font-semibold text-blue-600">Delivery Settlement</p><h2 className="text-2xl font-bold">Setor Kurir</h2><p className="text-sm text-slate-500">Rincian penerimaan dan pembayaran setoran harian.</p></div><button aria-label="Tutup modal" onClick={() => setSelected(null)}><X /></button></div>
      <div className="grid gap-6 p-6 lg:grid-cols-2"><div className="space-y-5"><section className="rounded-2xl bg-slate-50 p-5"><h3 className="font-bold">Ringkasan Kurir</h3><dl className="mt-4 grid grid-cols-2 gap-4 text-sm">{[["Tanggal",date(selected.operationalDate)],["Nama Kurir",selected.courierName],["DFOD",money(selected.dfodAmount)],["COD Tunai",money(selected.codCashOnlyAmount)],["COD QRIS",money(selected.codQrisAmount)]].map(([label,value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></section>
      <section><h3 className="font-bold">Form Pembayaran</h3>
      <label className="mt-4 block text-sm font-medium">Status<select value={adjustmentStatus} onChange={(event) => { const status = event.target.value as "BELUM_BAYAR" | "SUDAH_BAYAR"; setAdjustmentStatus(status); setAdjustmentError(""); setConfirmCancellation(false); if (status === "BELUM_BAYAR") { setCash("0"); setTransfers([]); } }} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="BELUM_BAYAR">Belum Bayar</option><option value="SUDAH_BAYAR">Sudah Bayar</option></select></label>
      {adjustmentStatus === "BELUM_BAYAR" && Number(selected.totalReceived) > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Mengubah status menjadi Belum Bayar akan membatalkan pembayaran settlement Delivery sebelumnya dan mengembalikan nominal ke Delivery Outstanding.</div>}
      <label className="mt-4 block text-sm font-medium">Bayar Tunai<input disabled={adjustmentStatus === "BELUM_BAYAR"} inputMode="numeric" value={cash} onChange={(event) => setCash(rupiahDigits(event.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2.5 disabled:bg-slate-100" /></label>
      <div className="mt-5"><h4 className="text-sm font-bold text-slate-800">Transfer</h4><div className="mt-3 space-y-3">{transfers.map((value,index) => <div key={index} className="rounded-xl border border-slate-200 p-3 sm:flex sm:items-end sm:gap-3"><label className="block flex-1 text-sm font-medium">Transfer {index + 1}<input disabled={adjustmentStatus === "BELUM_BAYAR"} aria-label={`Transfer ${index + 1}`} inputMode="numeric" value={value} onChange={(event) => setTransfers((current) => current.map((item,i) => i === index ? rupiahDigits(event.target.value) : item))} className="mt-1 w-full rounded-xl border px-3 py-2.5 disabled:bg-slate-100" /></label><button disabled={adjustmentStatus === "BELUM_BAYAR"} type="button" aria-label={`Hapus Transfer ${index + 1}`} onClick={() => removeTransfer(index)} className="mt-2 min-h-11 w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:mt-0 sm:w-auto">Hapus</button></div>)}</div>
      {adjustmentStatus === "SUDAH_BAYAR" && (transfers.length < 8 ? <button type="button" aria-label="Tambah Transfer" onClick={addTransfer} className="mt-3 min-h-11 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">+ Tambah Transfer</button> : <p className="mt-3 text-xs font-medium text-slate-500">Maksimal 8 transfer</p>)}</div>
      <label className="mt-4 block text-sm font-medium">Keterangan / Alasan Koreksi<textarea maxLength={500} value={note} onChange={(event) => { setNote(event.target.value); setAdjustmentError(""); }} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
      {adjustmentError && <p role="alert" className="mt-2 text-sm font-medium text-red-600">{adjustmentError}</p>}</section></div>
      <aside className="h-fit rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><h3 className="font-bold">Rekap Pembayaran</h3><dl className="mt-4 space-y-3 text-sm">{[["Total Setoran",draft.totalSettlement],["Bayar Tunai",draft.cashAmount],["Total Transfer",draft.transferAmount],["Total Diterima",draft.totalReceived],["Belum Bayar",draft.outstandingAmount]].map(([label,value]) => <div key={label as string} className="flex justify-between"><dt className="text-slate-600">{label}</dt><dd className="font-bold">{money(String(value))}</dd></div>)}</dl>{draft.overpaidAmount > 0n && <p className="mt-3 rounded-lg bg-blue-100 p-3 text-sm text-blue-800">Lebih bayar: <b>{money(String(draft.overpaidAmount))}</b></p>}<div className="mt-5 border-t border-blue-100 pt-4"><p className="text-sm text-slate-500">Status</p><p className="mt-1 text-xl font-bold">{draft.status === "UNCLEARED" ? "Belum Clear" : draft.status === "CLEAR" ? "Clear" : "Lebih Bayar"}</p></div></aside></div>
      {confirmCancellation && <div className="border-t border-amber-200 bg-amber-50 px-6 py-5"><h3 className="font-bold text-amber-950">Batalkan pembayaran Delivery ini?</h3><p className="mt-1 text-sm text-amber-900">Pembayaran dan transfer sebelumnya akan dibatalkan, saldo terkait akan dikoreksi, dan settlement kembali berstatus Belum Bayar. Histori tetap disimpan.</p><div className="mt-4 flex justify-end gap-3"><button type="button" onClick={() => setConfirmCancellation(false)} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 font-semibold">Kembali</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white disabled:opacity-60">Ya, Batalkan Pembayaran</button></div></div>}
      <div className="flex justify-end gap-3 border-t px-6 py-4"><button onClick={() => setSelected(null)} className="rounded-xl border px-5 py-2.5 font-semibold">Batal</button><button disabled={saving} onClick={() => void save()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white disabled:opacity-60">{saving && <LoaderCircle className="animate-spin" size={17} />}Simpan Setoran</button></div>
    </div></div>}
  </div>;
}

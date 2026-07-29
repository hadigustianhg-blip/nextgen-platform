"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudDownload, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { formatDateTime, formatMoney } from "./pickup-format";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type SettlementRow = {
  id: string;
  operationalDate: string;
  updatedAt: string;
  waybillNo: string;
  staff: string | null;
  sender: string | null;
  freightAmount: string;
  discountAmount: string;
  finalObligation: string;
  totalPaid: string;
  remainingAmount: string;
  paymentStatus: "BELUM_BAYAR" | "SUDAH_BAYAR" | "LEBIH_BAYAR";
  paymentMethod: string | null;
  transferAccountId: string | null;
  note: string | null;
};

type Account = { id: string; label: string };
type SettlementSummary = {
  nominalTotalPickup: string;
  totalPickupCount: number;
  unpaidCount: number;
  paidCount: number;
  overpaidCount: number;
  totalCash: string;
  cashPickupCount: number;
  totalTransfer: string;
  transferPickupCount: number;
};

const emptySummary: SettlementSummary = {
  nominalTotalPickup: "0",
  totalPickupCount: 0,
  unpaidCount: 0,
  paidCount: 0,
  overpaidCount: 0,
  totalCash: "0",
  cashPickupCount: 0,
  totalTransfer: "0",
  transferPickupCount: 0,
};

const statusLabels = {
  BELUM_BAYAR: "Belum Bayar",
  SUDAH_BAYAR: "Sudah Bayar",
  LEBIH_BAYAR: "Lebih Bayar",
} as const;

export function PickupSettlementClient({ outletCode }: { outletCode: string }) {
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [summary, setSummary] = useState<SettlementSummary>(emptySummary);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [operationalDate, setOperationalDate] = useState(jakartaOperationalDate);
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [selected, setSelected] = useState<SettlementRow | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [requestId, setRequestId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [adjustmentStatus, setAdjustmentStatus] = useState<"BELUM_BAYAR" | "SUDAH_BAYAR">("BELUM_BAYAR");
  const [adjustmentMethod, setAdjustmentMethod] = useState<"" | "TUNAI" | "TRANSFER">("");
  const [accountId, setAccountId] = useState("");
  const [accountError, setAccountError] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Map<string, SettlementRow>>(new Map());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkRequestId, setBulkRequestId] = useState("");
  const [bulkDiscount, setBulkDiscount] = useState("0");
  const [bulkStatus, setBulkStatus] = useState<"BELUM_BAYAR" | "SUDAH_BAYAR">("BELUM_BAYAR");
  const [bulkMethod, setBulkMethod] = useState<"" | "TUNAI" | "TRANSFER">("");
  const [bulkAccountId, setBulkAccountId] = useState("");
  const [bulkAccountError, setBulkAccountError] = useState("");
  const [bulkNote, setBulkNote] = useState("");

  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        operationalDate,
        search,
        staff,
        paymentStatus,
        paymentMethod,
      }).toString(),
    [page, pageSize, operationalDate, search, staff, paymentStatus, paymentMethod],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listResponse, runResponse] = await Promise.all([fetch(`/api/pickup/settlement?${query}`, { cache: "no-store" }), fetch("/api/pickup/runs/latest", { cache: "no-store" })]);
      if (!listResponse.ok || !runResponse.ok) throw new Error();
      const listBody = await listResponse.json();
      const runBody = await runResponse.json();
      setRows(listBody.data.rows);
      setPagination(listBody.data.pagination);
      setSummary(listBody.data.summary ?? emptySummary);
      setLastSyncAt(runBody.data?.completedAt ?? null);
    } catch {
      setNotice({
        tone: "error",
        text: "Data Pickup Settlement belum dapat dimuat.",
      });
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const response = await fetch("/api/pickup/transfer-accounts", {
          cache: "no-store",
        });
        if (response.ok) setAccounts((await response.json()).data);
      } catch {
        // Account options remain empty and transfer validation stays server-side.
      }
    });
  }, []);

  function resetBulkSelectionForFilter() {
    if (bulkSelected.size > 0 || bulkModalOpen) {
      setNotice({
        tone: "info",
        text: "Pilihan massal direset karena filter berubah.",
      });
    }
    setBulkSelected(new Map());
    setBulkModalOpen(false);
  }

  function cancelBulkMode() {
    setBulkMode(false);
    setBulkSelected(new Map());
    setBulkModalOpen(false);
  }

  function toggleBulkRow(row: SettlementRow) {
    setBulkSelected((current) => {
      const next = new Map(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  }

  function toggleCurrentPage() {
    setBulkSelected((current) => {
      const next = new Map(current);
      const allSelected = rows.length > 0 && rows.every((row) => next.has(row.id));
      for (const row of rows) {
        if (allSelected) next.delete(row.id);
        else next.set(row.id, row);
      }
      return next;
    });
  }

  function openBulkAdjustment() {
    if (!bulkMode) {
      setBulkMode(true);
      return;
    }
    if (bulkSelected.size === 0) return;
    setBulkRequestId(crypto.randomUUID());
    setBulkDiscount("0");
    setBulkStatus("BELUM_BAYAR");
    setBulkMethod("");
    setBulkAccountId("");
    setBulkAccountError("");
    setBulkNote("");
    setBulkModalOpen(true);
  }

  async function saveBulkAdjustment() {
    if (bulkSelected.size === 0 || saving) return;
    if (bulkStatus === "SUDAH_BAYAR" && bulkMethod === "TRANSFER" && !bulkAccountId) {
      setBulkAccountError("Pilih rekening transfer terlebih dahulu.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/pickup/settlement/bulk-adjustment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchRequestId: bulkRequestId,
          masterPickupIds: [...bulkSelected.keys()],
          discountAmount: bulkDiscount,
          status: bulkStatus,
          paymentMethod: bulkStatus === "SUDAH_BAYAR" ? bulkMethod || null : null,
          transferAccountId: bulkStatus === "SUDAH_BAYAR" && bulkMethod === "TRANSFER" ? bulkAccountId || null : null,
          note: bulkNote || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      const adjustedCount = body.data.adjustedCount;
      setBulkModalOpen(false);
      setBulkMode(false);
      setBulkSelected(new Map());
      setNotice({
        tone: "success",
        text: `${adjustedCount} pickup berhasil disesuaikan.`,
      });
      await loadData();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Penyesuaian massal gagal. Tidak ada data yang diubah.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function syncPickup() {
    setSyncing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/pickup/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setNotice({
        tone: "success",
        text: `Sync selesai: ${body.data.created} baru, ${body.data.updated} diperbarui.`,
      });
      setPage(1);
      await loadData();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Sinkronisasi gagal.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function openAdjustment(row: SettlementRow) {
    setSelected(row);
    setRequestId(crypto.randomUUID());
    setDiscount(row.discountAmount);
    setAdjustmentStatus(row.paymentStatus === "SUDAH_BAYAR" ? "SUDAH_BAYAR" : "BELUM_BAYAR");
    setAdjustmentMethod(row.paymentMethod === "TUNAI" || row.paymentMethod === "TRANSFER" ? row.paymentMethod : "");
    setAccountId(row.transferAccountId ?? "");
    setAccountError("");
    setNote(row.note ?? "");
    try {
      const [detailResponse, accountsResponse] = await Promise.all([fetch(`/api/pickup/settlements/${row.id}`, { cache: "no-store" }), fetch("/api/pickup/transfer-accounts", { cache: "no-store" })]);
      if (detailResponse.ok) {
        const detail = await detailResponse.json();
        const current = detail.data as SettlementRow;
        setSelected(current);
        setDiscount(current.discountAmount);
        setAdjustmentStatus(current.paymentStatus === "SUDAH_BAYAR" ? "SUDAH_BAYAR" : "BELUM_BAYAR");
        setAdjustmentMethod(current.paymentMethod === "TUNAI" || current.paymentMethod === "TRANSFER" ? current.paymentMethod : "");
        setAccountId(current.transferAccountId ?? "");
        setNote(current.note ?? "");
      }
      if (accountsResponse.ok) {
        const accountBody = await accountsResponse.json();
        setAccounts(accountBody.data);
      }
    } catch {
      // The already scoped table row remains usable; save still validates server-side.
    }
  }

  function closeModal() {
    if (!saving) setSelected(null);
  }

  async function saveAdjustment() {
    if (!selected || saving) return;
    if (adjustmentStatus === "SUDAH_BAYAR" && adjustmentMethod === "TRANSFER" && !accountId) {
      setAccountError("Pilih rekening transfer terlebih dahulu.");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/pickup/settlements/${selected.id}/adjust`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          discountAmount: discount,
          status: adjustmentStatus,
          paymentMethod: adjustmentStatus === "SUDAH_BAYAR" ? adjustmentMethod || null : null,
          transferAccountId: adjustmentStatus === "SUDAH_BAYAR" && adjustmentMethod === "TRANSFER" ? accountId || null : null,
          note: note || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setSelected(null);
      setNotice({
        tone: "success",
        text: `Penyesuaian ${body.data.waybillNo} berhasil disimpan.`,
      });
      await loadData();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Penyesuaian gagal.",
      });
    } finally {
      setSaving(false);
    }
  }

  const previewReceived = selected ? Math.max(0, Number(selected.freightAmount) - Number(discount || 0)) : 0;
  const selectedRows = [...bulkSelected.values()];
  const bulkFreightTotal = selectedRows.reduce((total, row) => total + Number(row.freightAmount), 0);
  const bulkCurrentObligation = selectedRows.reduce((total, row) => total + Number(row.finalObligation), 0);
  const allCurrentPageSelected = rows.length > 0 && rows.every((row) => bulkSelected.has(row.id));

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Settlement Center</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Pickup Settlement</h1>
          <p className="mt-2 text-sm text-slate-500">Hanya pickup dengan settlement Tunai untuk outlet {outletCode}.</p>
          <p className="mt-1 text-xs text-slate-400">Sinkronisasi terakhir: {formatDateTime(lastSyncAt)}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => void loadData()} disabled={loading || syncing} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => void syncPickup()} disabled={syncing} className="flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-60">
            {syncing ? <LoaderCircle size={17} className="animate-spin" /> : <CloudDownload size={17} />}
            {syncing ? "Sinkronisasi…" : "Sinkronkan Pickup"}
          </button>
        </div>
      </div>

      {notice && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : notice.tone === "info" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</div>}

      <section className="mt-6 grid gap-4 lg:grid-cols-3" aria-label="Ringkasan Pickup Settlement">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nominal Total Pickup</p>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{formatMoney(summary.nominalTotalPickup)}</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">{summary.totalPickupCount} Resi</p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.unpaidCount} Belum Bayar • {summary.paidCount} Sudah Bayar
            {summary.overpaidCount > 0 ? ` • ${summary.overpaidCount} Lebih Bayar` : ""}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total Tunai</p>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{formatMoney(summary.totalCash)}</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">{summary.cashPickupCount} Resi</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total Transfer</p>
          <p className="mt-3 text-2xl font-extrabold text-slate-900">{formatMoney(summary.totalTransfer)}</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">{summary.transferPickupCount} Resi</p>
        </article>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-8">
          <input
            aria-label="Tanggal operasional"
            type="date"
            value={operationalDate}
            onChange={(event) => {
              resetBulkSelectionForFilter();
              setOperationalDate(event.target.value);
              setPage(1);
            }}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input
              value={search}
              onChange={(event) => {
                resetBulkSelectionForFilter();
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Cari waybill…"
              className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm"
            />
          </label>
          <input
            value={staff}
            onChange={(event) => {
              resetBulkSelectionForFilter();
              setStaff(event.target.value);
              setPage(1);
            }}
            placeholder="Filter staff"
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          />
          <select
            value={paymentStatus}
            onChange={(event) => {
              resetBulkSelectionForFilter();
              setPaymentStatus(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="">Semua status</option>
            <option value="BELUM_BAYAR">Belum Bayar</option>
            <option value="SUDAH_BAYAR">Sudah Bayar</option>
            <option value="LEBIH_BAYAR">Lebih Bayar</option>
          </select>
          <select
            value={paymentMethod}
            onChange={(event) => {
              resetBulkSelectionForFilter();
              setPaymentMethod(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="">Semua metode</option>
            <option value="TUNAI">Tunai</option>
            <option value="TRANSFER">Transfer</option>
          </select>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} baris
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={openBulkAdjustment} className="h-10 flex-1 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white">
              {bulkMode && bulkSelected.size > 0 ? `Sesuaikan (${bulkSelected.size})` : "Penyesuaian Massal"}
            </button>
            {bulkMode && (
              <button onClick={cancelBulkMode} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600">
                Batal
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                {bulkMode && (
                  <th className="px-4 py-3">
                    <input aria-label="Pilih semua data halaman ini" type="checkbox" checked={allCurrentPageSelected} onChange={toggleCurrentPage} />
                  </th>
                )}
                {["Waktu Diperbarui", "Waybill", "Staff", "Pengirim", "Ongkir", "Status Pembayaran", "Metode Bayar", "Rekening Transfer", "Keterangan", "Aksi"].map((column) => (
                  <th key={column} className="px-4 py-3 font-bold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={bulkMode ? 11 : 10} className="py-16 text-center text-slate-500">
                    <LoaderCircle className="mx-auto mb-2 animate-spin" />
                    Memuat data…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={bulkMode ? 11 : 10} className="py-16 text-center text-slate-500">
                    Belum ada pickup Tunai.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30">
                    {bulkMode && (
                      <td className="px-4 py-3">
                        <input aria-label={`Pilih ${row.waybillNo}`} type="checkbox" checked={bulkSelected.has(row.id)} onChange={() => toggleBulkRow(row)} />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.updatedAt)}</td>
                    <td className="px-4 py-3 font-bold text-blue-700">{row.waybillNo}</td>
                    <td className="px-4 py-3">{row.staff ?? "—"}</td>
                    <td className="px-4 py-3">{row.sender ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatMoney(row.freightAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.paymentStatus === "SUDAH_BAYAR" ? "bg-emerald-50 text-emerald-700" : row.paymentStatus === "LEBIH_BAYAR" ? "bg-violet-50 text-violet-700" : "bg-amber-50 text-amber-700"}`}>{statusLabels[row.paymentStatus]}</span>
                    </td>
                    <td className="px-4 py-3">{row.paymentMethod ?? "—"}</td>
                    <td className="px-4 py-3">{accounts.find((account) => account.id === row.transferAccountId)?.label ?? row.transferAccountId ?? "—"}</td>
                    <td className="max-w-52 truncate px-4 py-3" title={row.note ?? ""}>
                      {row.note ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => void openAdjustment(row)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                        Penyesuaian
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm text-slate-600">
          <span>{pagination.total} data</span>
          <div className="flex items-center gap-3">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">
              Sebelumnya
            </button>
            <span>
              Halaman {pagination.page} / {pagination.totalPages}
            </span>
            <button disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">
              Berikutnya
            </button>
          </div>
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Penyesuaian Pickup">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Penyesuaian Pickup</h2>
                <p className="mt-1 text-xs text-slate-500">Revision tersimpan tanpa menghapus histori.</p>
              </div>
              <button onClick={closeModal} disabled={saving} aria-label="Tutup modal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="grid gap-3 bg-slate-50 p-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Tanggal", formatDateTime(selected.operationalDate)],
                ["Waybill", selected.waybillNo],
                ["Staff", selected.staff ?? "—"],
                ["Pengirim", selected.sender ?? "—"],
                ["Ongkir", formatMoney(selected.freightAmount)],
                ["Total Diterima saat ini", formatMoney(selected.totalPaid)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Diskon
                <input type="number" min="0" max={selected.freightAmount} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Status
                <select
                  value={adjustmentStatus}
                  onChange={(event) => {
                    const status = event.target.value as "BELUM_BAYAR" | "SUDAH_BAYAR";
                    setAdjustmentStatus(status);
                    if (status === "BELUM_BAYAR") {
                      setAdjustmentMethod("");
                      setAccountId("");
                      setAccountError("");
                    }
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal"
                >
                  <option value="BELUM_BAYAR">Belum Bayar</option>
                  <option value="SUDAH_BAYAR">Sudah Bayar</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Metode Bayar
                <select
                  disabled={adjustmentStatus === "BELUM_BAYAR"}
                  value={adjustmentMethod}
                  onChange={(event) => {
                    const method = event.target.value as "" | "TUNAI" | "TRANSFER";
                    setAdjustmentMethod(method);
                    if (method !== "TRANSFER") {
                      setAccountId("");
                      setAccountError("");
                    }
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal disabled:bg-slate-100"
                >
                  <option value="">Pilih metode</option>
                  <option value="TUNAI">Tunai</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Rekening Transfer
                <select
                  aria-invalid={Boolean(accountError)}
                  aria-describedby={accountError ? "pickup-transfer-account-error" : undefined}
                  disabled={adjustmentStatus !== "SUDAH_BAYAR" || adjustmentMethod !== "TRANSFER"}
                  value={accountId}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setAccountError("");
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal disabled:bg-slate-100"
                >
                  <option value="">Pilih rekening</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </select>
                {accountError && (
                  <span id="pickup-transfer-account-error" role="alert" className="mt-1.5 block text-xs font-medium text-red-600">
                    {accountError}
                  </span>
                )}
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Keterangan
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal" />
              </label>
              <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900 sm:col-span-2">
                Total setelah diskon: <strong>{formatMoney(previewReceived)}</strong>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button onClick={closeModal} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
                Batal
              </button>
              <button onClick={() => void saveAdjustment()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {saving && <LoaderCircle size={16} className="animate-spin" />} Simpan Penyesuaian
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Penyesuaian Massal">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Penyesuaian Massal</h2>
                <p className="mt-1 text-xs text-slate-500">Perubahan diterapkan per resi dalam satu transaksi.</p>
              </div>
              <button onClick={() => !saving && setBulkModalOpen(false)} disabled={saving} aria-label="Tutup modal massal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="grid gap-3 bg-slate-50 p-6 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Jumlah resi</p>
                <p className="mt-1 font-bold">{bulkSelected.size}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Total ongkir</p>
                <p className="mt-1 font-bold">{formatMoney(bulkFreightTotal)}</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Kewajiban saat ini</p>
                <p className="mt-1 font-bold">{formatMoney(bulkCurrentObligation)}</p>
              </div>
              <div className="rounded-xl bg-white p-3 text-sm sm:col-span-3">
                {selectedRows
                  .slice(0, 5)
                  .map((row) => row.waybillNo)
                  .join(", ")}
                {selectedRows.length > 5 ? ` + ${selectedRows.length - 5} resi lainnya` : ""}
              </div>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Diskon per resi
                <input type="number" min="0" step="0.01" value={bulkDiscount} onChange={(event) => setBulkDiscount(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Status
                <select
                  value={bulkStatus}
                  onChange={(event) => {
                    const status = event.target.value as "BELUM_BAYAR" | "SUDAH_BAYAR";
                    setBulkStatus(status);
                    if (status === "BELUM_BAYAR") {
                      setBulkMethod("");
                      setBulkAccountId("");
                      setBulkAccountError("");
                    }
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal"
                >
                  <option value="BELUM_BAYAR">Belum Bayar</option>
                  <option value="SUDAH_BAYAR">Sudah Bayar</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Metode Bayar
                <select
                  disabled={bulkStatus === "BELUM_BAYAR"}
                  value={bulkMethod}
                  onChange={(event) => {
                    const method = event.target.value as "" | "TUNAI" | "TRANSFER";
                    setBulkMethod(method);
                    if (method !== "TRANSFER") {
                      setBulkAccountId("");
                      setBulkAccountError("");
                    }
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal disabled:bg-slate-100"
                >
                  <option value="">Pilih metode</option>
                  <option value="TUNAI">Tunai</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Rekening Transfer
                <select
                  aria-invalid={Boolean(bulkAccountError)}
                  aria-describedby={bulkAccountError ? "pickup-bulk-transfer-account-error" : undefined}
                  disabled={bulkStatus !== "SUDAH_BAYAR" || bulkMethod !== "TRANSFER"}
                  value={bulkAccountId}
                  onChange={(event) => {
                    setBulkAccountId(event.target.value);
                    setBulkAccountError("");
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal disabled:bg-slate-100"
                >
                  <option value="">Pilih rekening</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </select>
                {bulkAccountError && (
                  <span id="pickup-bulk-transfer-account-error" role="alert" className="mt-1.5 block text-xs font-medium text-red-600">
                    {bulkAccountError}
                  </span>
                )}
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Keterangan
                <textarea value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal" />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setBulkModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
                Batal
              </button>
              <button onClick={() => void saveBulkAdjustment()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {saving && <LoaderCircle size={16} className="animate-spin" />} Simpan Penyesuaian Massal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

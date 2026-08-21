"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, History, LoaderCircle, Wallet, X } from "lucide-react";
import {
  FilterCard,
  MetricCard,
  ModalCard,
  PageHeader,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
} from "@/components/ui";

type Row = {
  id: string;
  pickupDate: string;
  ageDays: number;
  waybill: string;
  customer: string;
  staff: string | null;
  freight: string;
  obligation: string;
  paid: string;
  outstanding: string;
  status: string;
};
type HistoryItem = {
  id: string;
  paymentDate: string;
  method: string;
  amount: string;
  reference: string | null;
  bank: string | null;
  note: string | null;
  status: string;
  createdBy: string;
  transferProofUrl: string | null;
};
type Detail = {
  id: string;
  waybill: string;
  customer: string;
  pickupDate: string;
  freight: string;
  obligation: string;
  paid: string;
  outstanding: string;
  history: HistoryItem[];
};
type Result = {
  data: Row[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalOutstanding: string;
    outstandingWaybills: number;
    cashPaymentMonth: string;
    transferPaymentMonth: string;
    overdueOver7: number;
  };
};
const money = (value: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

export function PickupPaymentClient({
  canCreate,
  canManage,
}: {
  canCreate: boolean;
  canManage: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({
    totalOutstanding: "0",
    outstandingWaybills: 0,
    cashPaymentMonth: "0",
    transferPaymentMonth: "0",
    overdueOver7: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({
    pickupDate: "",
    waybill: "",
    customer: "",
    staff: "",
    status: "",
    age: "",
    method: "",
    search: "",
  });
  const [selected, setSelected] = useState<Detail | null>(null);
  const [mode, setMode] = useState<"pay" | "history" | null>(null);
  const [editing, setEditing] = useState<HistoryItem | null>(null);
  const [error, setError] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Map<string, Row>>(new Map());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkRequestId, setBulkRequestId] = useState("");
  const [bulkPaymentDate, setBulkPaymentDate] = useState(today());
  const [bulkMethod, setBulkMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [bulkReference, setBulkReference] = useState("");
  const [bulkBank, setBulkBank] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [transferProof, setTransferProof] = useState<File | null>(null);
  const [transferProofPreview, setTransferProofPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...filters,
      }).toString(),
    [page, pageSize, filters],
  );
  const load = useCallback(async () => {
    const response = await fetch(`/api/pickup-payment?${query}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as Result;
      setRows(data.data);
      setSummary(data.summary);
      setPagination(data.pagination);
    }
  }, [query]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function open(row: Row, nextMode: "pay" | "history") {
    const response = await fetch(`/api/pickup-payment/${row.id}`, {
      cache: "no-store",
    });
    if (response.ok) {
      setSelected((await response.json()).data as Detail);
      setMode(nextMode);
      setEditing(null);
      setError("");
      setPaymentMethod("CASH");
      clearTransferProof();
    }
  }
  function clearTransferProof() {
    setTransferProof(null);
    setTransferProofPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }
  function selectTransferProof(file: File | null) {
    clearTransferProof();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Bukti transfer harus JPG, PNG, atau WebP dengan ukuran maksimal 5 MB.");
      return;
    }
    setError("");
    setTransferProof(file);
    setTransferProofPreview(URL.createObjectURL(file));
  }
  function paymentPayload(form: HTMLFormElement, confirmOverpayment: boolean) {
    const payload = new FormData(form);
    if (!editing) payload.set("masterPickupId", selected!.id);
    payload.set("requestKey", crypto.randomUUID());
    payload.set("confirmOverpayment", String(confirmOverpayment));
    if (paymentMethod === "TRANSFER" && transferProof) payload.set("transferProof", transferProof);
    return payload;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (paymentMethod === "TRANSFER" && !transferProof && !editing?.transferProofUrl) {
      setError("Bukti transfer wajib diunggah untuk pembayaran Transfer.");
      return;
    }
    const endpoint = editing
      ? `/api/pickup-payment/${editing.id}`
      : "/api/pickup-payment";
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    const response = await fetch(endpoint, { method: editing ? "PATCH" : "POST", body: paymentPayload(form, false) });
    if (
      response.status === 409 &&
      window.confirm(
        "Nominal melebihi outstanding. Lanjutkan sebagai overpayment?",
      )
    ) {
      const retry = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        body: paymentPayload(form, true),
      });
      if (retry.ok) {
        setMode(null);
        setSelected(null);
        setEditing(null);
        clearTransferProof();
        setSaving(false);
        await load();
        return;
      }
    }
    if (!response.ok) {
      setError("Pembayaran gagal disimpan.");
      setSaving(false);
      return;
    }
    setMode(null);
    setSelected(null);
    setEditing(null);
    clearTransferProof();
    setSaving(false);
    await load();
  }
  async function voidPayment(id: string) {
    const reason = window.prompt("Alasan void");
    if (!reason) return;
    const response = await fetch(`/api/pickup-payment/${id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestKey: crypto.randomUUID(), reason }),
    });
    if (response.ok && selected) {
      const refreshed = await fetch(`/api/pickup-payment/${selected.id}`);
      setSelected((await refreshed.json()).data as Detail);
      await load();
    }
  }
  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
    setBulkSelected(new Map());
  };
  const eligible = (row: Row) =>
    Number(row.outstanding) > 0 && ["BELUM_BAYAR", "SEBAGIAN"].includes(row.status);
  const eligiblePageRows = rows.filter(eligible);
  const selectedRows = [...bulkSelected.values()];
  const allEligibleSelected = eligiblePageRows.length > 0 &&
    eligiblePageRows.every((row) => bulkSelected.has(row.id));
  const selectedObligation = selectedRows.reduce((sum, row) => sum + Number(row.obligation), 0);
  const selectedPaid = selectedRows.reduce((sum, row) => sum + Number(row.paid), 0);
  const selectedOutstanding = selectedRows.reduce((sum, row) => sum + Number(row.outstanding), 0);

  function toggleBulkMode() {
    setBulkMode((value) => !value);
    setBulkSelected(new Map());
    setBulkModalOpen(false);
    setBulkError("");
  }
  function toggleBulkRow(row: Row) {
    if (!eligible(row)) return;
    setBulkSelected((current) => {
      const next = new Map(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  }
  function toggleAllEligible() {
    setBulkSelected((current) => {
      const next = new Map(current);
      if (allEligibleSelected) eligiblePageRows.forEach((row) => next.delete(row.id));
      else eligiblePageRows.forEach((row) => next.set(row.id, row));
      return next;
    });
  }
  function openBulkModal() {
    if (bulkSelected.size === 0) return;
    setBulkRequestId(crypto.randomUUID());
    setBulkPaymentDate(today());
    setBulkMethod("CASH");
    setBulkReference("");
    setBulkBank("");
    setBulkNote("");
    setBulkError("");
    setBulkModalOpen(true);
  }
  async function submitBulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bulkSaving || bulkSelected.size === 0) return;
    if (bulkMethod === "TRANSFER" && !bulkBank.trim()) {
      setBulkError("Bank wajib diisi untuk pembayaran transfer.");
      return;
    }
    setBulkSaving(true);
    setBulkError("");
    const count = bulkSelected.size;
    try {
      const response = await fetch("/api/pickup-payment/bulk-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchRequestId: bulkRequestId,
          masterPickupIds: [...bulkSelected.keys()],
          paymentDate: bulkPaymentDate,
          method: bulkMethod,
          reference: bulkReference,
          bank: bulkMethod === "TRANSFER" ? bulkBank : "",
          note: bulkNote,
        }),
      });
      const body = await response.json() as { error?: { code?: string } };
      if (!response.ok) throw new Error(body.error?.code || "BULK_ADJUSTMENT_FAILED");
      setBulkModalOpen(false);
      setBulkMode(false);
      setBulkSelected(new Map());
      setNotice(`Penyesuaian massal berhasil diterapkan pada ${count} data.`);
      await load();
    } catch (bulkSubmitError) {
      setBulkError(bulkSubmitError instanceof Error
        ? bulkSubmitError.message
        : "Penyesuaian massal gagal disimpan.");
    } finally {
      setBulkSaving(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payment"
        title="Pickup Payment"
        description="Accounts Receivable pickup dan history pembayaran."
      />
      <p className="text-sm text-slate-500">Pickup Payment hanya menampilkan waybill dengan Settlement Tunai.</p>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Outstanding", money(summary.totalOutstanding)],
          ["Waybill Outstanding", String(summary.outstandingWaybills)],
          ["Cash Payment Bulan Ini", money(summary.cashPaymentMonth)],
          ["Transfer Payment Bulan Ini", money(summary.transferPaymentMonth)],
          ["Overdue > 7 Hari", String(summary.overdueOver7)],
        ].map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </section>
      <FilterCard className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <input
          type="date"
          aria-label="Tanggal pickup"
          value={filters.pickupDate}
          onChange={(e) => setFilter("pickupDate", e.target.value)}
          className={nextgenControlClass}
        />
        <input
          placeholder="Waybill"
          value={filters.waybill}
          onChange={(e) => setFilter("waybill", e.target.value)}
          className={nextgenControlClass}
        />
        <input
          placeholder="Customer"
          value={filters.customer}
          onChange={(e) => setFilter("customer", e.target.value)}
          className={nextgenControlClass}
        />
        <input
          placeholder="Staff"
          value={filters.staff}
          onChange={(e) => setFilter("staff", e.target.value)}
          className={nextgenControlClass}
        />
        <input
          placeholder="Search"
          value={filters.search}
          onChange={(e) => setFilter("search", e.target.value)}
          className={nextgenControlClass}
        />
        <select
          aria-label="Status"
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className={nextgenControlClass}
        >
          <option value="">Outstanding</option>
          <option value="BELUM_BAYAR">Belum Bayar</option>
          <option value="SEBAGIAN">Sebagian</option>
          <option value="LUNAS">Lunas</option>
          <option value="LEBIH_BAYAR">Lebih Bayar</option>
        </select>
        <select
          aria-label="Umur piutang"
          value={filters.age}
          onChange={(e) => setFilter("age", e.target.value)}
          className={nextgenControlClass}
        >
          <option value="">Semua</option>
          <option value="TODAY">Hari Ini</option>
          <option value="1_3">1–3 Hari</option>
          <option value="4_7">4–7 Hari</option>
          <option value="OVER_7">&gt;7 Hari</option>
          <option value="OVER_30">&gt;30 Hari</option>
        </select>
        <select
          aria-label="Metode"
          value={filters.method}
          onChange={(e) => setFilter("method", e.target.value)}
          className={nextgenControlClass}
        >
          <option value="">Semua metode</option>
          <option value="CASH">Cash</option>
          <option value="TRANSFER">Transfer</option>
        </select>
        <select
          aria-label="Jumlah baris"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
            setBulkSelected(new Map());
          }}
          className={nextgenControlClass}
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </FilterCard>
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-600">
            {bulkMode
              ? bulkSelected.size > 0
                ? `${bulkSelected.size} data dipilih`
                : eligiblePageRows.length > 0
                  ? "Pilih data Pickup Payment yang akan disesuaikan."
                  : "Tidak ada data Pickup Payment yang dapat disesuaikan."
              : "Penyesuaian pembayaran untuk beberapa waybill sekaligus."}
          </div>
          <div className="flex flex-wrap gap-2">
            {bulkMode && bulkSelected.size > 0 && (
              <button type="button" onClick={openBulkModal} className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700`}>
                <CheckSquare size={17} /> Sesuaikan {bulkSelected.size} Data
              </button>
            )}
            <button type="button" onClick={toggleBulkMode} className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
              {bulkMode ? "Batal Penyesuaian" : "Penyesuaian Massal"}
            </button>
          </div>
        </div>
      )}
      <TableCard
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <span>{pagination.total} waybill</span>
            <div className="flex gap-3">
              <button disabled={page <= 1} onClick={() => { setPage(page - 1); setBulkSelected(new Map()); }}>
                Sebelumnya
              </button>
              <span>
                {page} / {Math.max(1, pagination.totalPages)}
              </span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => { setPage(page + 1); setBulkSelected(new Map()); }}
              >
                Berikutnya
              </button>
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {bulkMode && <th className="px-4 py-3">
                <input
                  aria-label="Pilih semua data eligible pada halaman ini"
                  type="checkbox"
                  checked={allEligibleSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = bulkSelected.size > 0 && !allEligibleSelected;
                  }}
                  disabled={eligiblePageRows.length === 0}
                  onChange={toggleAllEligible}
                />
              </th>}
              {[
                "Tanggal Pickup",
                "Umur",
                "Waybill",
                "Customer",
                "Staff",
                "Ongkir",
                "Sudah Dibayar",
                "Belum Dibayar",
                "Status",
                "Aksi",
              ].map((x) => (
                <th key={x} className="px-4 py-3">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                {bulkMode && <td className="px-4 py-3">
                  <input
                    aria-label={`Pilih ${row.waybill}`}
                    title={eligible(row) ? "Pilih data" : "Data sudah lunas atau tidak dapat disesuaikan"}
                    type="checkbox"
                    checked={bulkSelected.has(row.id)}
                    disabled={!eligible(row)}
                    onChange={() => toggleBulkRow(row)}
                  />
                </td>}
                <td className="px-4 py-3">{row.pickupDate.slice(0, 10)}</td>
                <td className="px-4">{row.ageDays} hari</td>
                <td className="px-4 font-bold">{row.waybill}</td>
                <td className="px-4">{row.customer}</td>
                <td className="px-4">{row.staff ?? "—"}</td>
                <td className="px-4">{money(row.freight)}</td>
                <td className="px-4">{money(row.paid)}</td>
                <td className="px-4 font-bold text-red-700">
                  {money(row.outstanding)}
                </td>
                <td className="px-4">{row.status}</td>
                <td className="px-4">
                  <span className="flex gap-3">
                    {canCreate && row.status !== "LUNAS" && (
                      <button
                        onClick={() => void open(row, "pay")}
                        className="font-bold text-blue-600"
                      >
                        <Wallet size={15} className="inline" /> Bayar
                      </button>
                    )}
                    <button
                      onClick={() => void open(row, "history")}
                      className="font-bold text-slate-600"
                    >
                      <History size={15} className="inline" /> History
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </TableCard>
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Penyesuaian Massal Pickup Payment">
          <ModalCard className="max-h-[92vh] max-w-3xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-black">Penyesuaian Massal Pickup Payment</h2><p className="mt-1 text-sm text-slate-500">Setiap data akan dibayar penuh sesuai outstanding masing-masing.</p></div>
              <button type="button" disabled={bulkSaving} onClick={() => setBulkModalOpen(false)} aria-label="Tutup"><X /></button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Data Dipilih", `${bulkSelected.size}`], ["Total Kewajiban", money(String(selectedObligation))], ["Sudah Dibayar", money(String(selectedPaid))], ["Total Penyesuaian", money(String(selectedOutstanding))]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>
              ))}
            </div>
            <div className="mt-4 max-h-44 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-[620px] w-full text-left text-xs"><thead className="bg-slate-50"><tr>{["Waybill", "Outstanding Lama", "Penyesuaian", "Belum Dibayar Baru", "Status Baru"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
                <tbody>{selectedRows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2 font-semibold">{row.waybill}</td><td className="px-3 py-2">{money(row.outstanding)}</td><td className="px-3 py-2">{money(row.outstanding)}</td><td className="px-3 py-2">{money("0")}</td><td className="px-3 py-2">LUNAS</td></tr>)}</tbody>
              </table>
            </div>
            <form onSubmit={submitBulk} className="mt-5 grid gap-3 sm:grid-cols-2">
              <input aria-label="Tanggal pembayaran massal" type="date" required disabled={bulkSaving} value={bulkPaymentDate} onChange={(event) => setBulkPaymentDate(event.target.value)} className={nextgenControlClass} />
              <select aria-label="Metode pembayaran massal" disabled={bulkSaving} value={bulkMethod} onChange={(event) => setBulkMethod(event.target.value as "CASH" | "TRANSFER")} className={nextgenControlClass}><option value="CASH">Cash</option><option value="TRANSFER">Transfer</option></select>
              <input placeholder="Reference" disabled={bulkSaving} value={bulkReference} onChange={(event) => setBulkReference(event.target.value)} className={nextgenControlClass} />
              <input placeholder="Bank (wajib untuk transfer)" disabled={bulkSaving || bulkMethod !== "TRANSFER"} value={bulkBank} onChange={(event) => setBulkBank(event.target.value)} className={nextgenControlClass} />
              <textarea placeholder="Keterangan" disabled={bulkSaving} value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} className={`${nextgenControlClass} min-h-24 py-3 sm:col-span-2`} />
              {bulkError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{bulkError}</p>}
              <div className="flex justify-end gap-3 sm:col-span-2">
                <button type="button" disabled={bulkSaving} onClick={() => setBulkModalOpen(false)} className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700`}>Batal</button>
                <button type="submit" disabled={bulkSaving} className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60`}>{bulkSaving && <LoaderCircle size={17} className="animate-spin" />}Simpan Penyesuaian</button>
              </div>
            </form>
          </ModalCard>
        </div>
      )}
      {selected && mode && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <ModalCard className="max-h-[92vh] max-w-2xl overflow-y-auto p-6">
            <div className="flex justify-between">
              <h2 className="text-xl font-black">
                {mode === "pay"
                  ? editing
                    ? "Edit Pembayaran Pickup"
                    : "Pembayaran Pickup"
                  : "History Payment"}
              </h2>
              <button
                onClick={() => {
                  setMode(null);
                  setSelected(null);
                  setEditing(null);
                  clearTransferProof();
                }}
              >
                <X />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <p>
                Waybill
                <br />
                <b>{selected.waybill}</b>
              </p>
              <p>
                Customer
                <br />
                <b>{selected.customer}</b>
              </p>
              <p>
                Tanggal Pickup
                <br />
                <b>{selected.pickupDate.slice(0, 10)}</b>
              </p>
              <p>
                Ongkir
                <br />
                <b>{money(selected.freight)}</b>
              </p>
              <p>
                Sudah Dibayar
                <br />
                <b>{money(selected.paid)}</b>
              </p>
              <p>
                Belum Dibayar
                <br />
                <b>{money(selected.outstanding)}</b>
              </p>
            </div>
            {mode === "pay" ? (
              <form onSubmit={submit} className="mt-5 grid gap-3">
                <input
                  name="paymentDate"
                  type="date"
                  defaultValue={editing?.paymentDate.slice(0, 10) ?? today()}
                  required
                  className={nextgenControlClass}
                />
                <select
                  name="method"
                  value={paymentMethod}
                  onChange={(event) => {
                    const method = event.target.value as "CASH" | "TRANSFER";
                    setPaymentMethod(method);
                    if (method === "CASH") clearTransferProof();
                  }}
                  disabled={saving}
                  className={nextgenControlClass}
                >
                  <option value="CASH">Cash</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
                <input
                  name="amount"
                  defaultValue={
                    editing?.amount ?? Math.max(0, Number(selected.outstanding))
                  }
                  pattern="[1-9][0-9]*"
                  required
                  className={nextgenControlClass}
                  placeholder="Nominal"
                />
                <input
                  name="reference"
                  defaultValue={editing?.reference ?? ""}
                  className={nextgenControlClass}
                  placeholder="Reference"
                />
                <input
                  name="bank"
                  defaultValue={editing?.bank ?? ""}
                  className={nextgenControlClass}
                  placeholder="Bank (wajib untuk transfer)"
                />
                {paymentMethod === "TRANSFER" && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <label className="block text-sm font-semibold text-slate-700" htmlFor="pickup-transfer-proof">Bukti Transfer</label>
                    <input
                      id="pickup-transfer-proof"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      required={!editing?.transferProofUrl}
                      disabled={saving}
                      onChange={(event) => selectTransferProof(event.target.files?.[0] ?? null)}
                      className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white"
                    />
                    {(transferProofPreview || editing?.transferProofUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={transferProofPreview || editing?.transferProofUrl || ""} alt="Preview bukti transfer" className="mt-3 max-h-64 w-full rounded-xl border border-slate-200 bg-white object-contain" />
                    )}
                    <p className="mt-2 text-xs text-slate-500">JPG, PNG, atau WebP · maksimal 5 MB</p>
                  </div>
                )}
                <textarea
                  name="note"
                  defaultValue={editing?.note ?? ""}
                  className={`${nextgenControlClass} min-h-24 py-3`}
                  placeholder="Keterangan"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  disabled={saving}
                  className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  {saving ? "Menyimpan…" : "Simpan Pembayaran"}
                </button>
              </form>
            ) : (
              <div className="mt-5 space-y-3">
                {selected.history.length === 0 ? (
                  <p className="text-slate-500">Belum ada pembayaran.</p>
                ) : (
                  selected.history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border p-4 text-sm"
                    >
                      <div className="flex justify-between">
                        <b>
                          {item.paymentDate.slice(0, 10)} · {item.method}
                        </b>
                        <b>{money(item.amount)}</b>
                      </div>
                      <p className="text-slate-500">
                        {item.reference || "Tanpa reference"} · {item.status} ·{" "}
                        {item.createdBy}
                      </p>
                      {item.transferProofUrl && (
                        <a href={item.transferProofUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-blue-600">Lihat Bukti Transfer</a>
                      )}
                      {canManage && item.status === "VALID" && (
                        <div className="mt-2 flex gap-3">
                          <button
                            onClick={() => {
                              setEditing(item);
                              setPaymentMethod(item.method === "TRANSFER" ? "TRANSFER" : "CASH");
                              clearTransferProof();
                              setMode("pay");
                            }}
                            className="text-xs font-bold text-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void voidPayment(item.id)}
                            className="text-xs font-bold text-red-600"
                          >
                            Void
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </ModalCard>
        </div>
      )}
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { History, Wallet, X } from "lucide-react";
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
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const endpoint = editing
      ? `/api/pickup-payment/${editing.id}`
      : "/api/pickup-payment";
    const response = await fetch(endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        ...(editing ? {} : { masterPickupId: selected.id }),
        requestKey: crypto.randomUUID(),
        confirmOverpayment: false,
      }),
    });
    if (
      response.status === 409 &&
      window.confirm(
        "Nominal melebihi outstanding. Lanjutkan sebagai overpayment?",
      )
    ) {
      const retry = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          ...(editing ? {} : { masterPickupId: selected.id }),
          requestKey: crypto.randomUUID(),
          confirmOverpayment: true,
        }),
      });
      if (retry.ok) {
        setMode(null);
        setSelected(null);
        setEditing(null);
        await load();
        return;
      }
    }
    if (!response.ok) {
      setError("Pembayaran gagal disimpan.");
      return;
    }
    setMode(null);
    setSelected(null);
    setEditing(null);
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
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payment"
        title="Pickup Payment"
        description="Accounts Receivable pickup dan history pembayaran."
      />
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
          }}
          className={nextgenControlClass}
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </FilterCard>
      <TableCard
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <span>{pagination.total} waybill</span>
            <div className="flex gap-3">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <span>
                {page} / {Math.max(1, pagination.totalPages)}
              </span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </button>
            </div>
          </div>
        }
      >
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
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
        </table>
      </TableCard>
      {selected && mode && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <ModalCard className="max-w-2xl p-6">
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
                  defaultValue={editing?.method ?? "CASH"}
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
                <textarea
                  name="note"
                  defaultValue={editing?.note ?? ""}
                  className={`${nextgenControlClass} min-h-24 py-3`}
                  placeholder="Keterangan"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  Simpan Pembayaran
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
                      {canManage && item.status === "VALID" && (
                        <div className="mt-2 flex gap-3">
                          <button
                            onClick={() => {
                              setEditing(item);
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

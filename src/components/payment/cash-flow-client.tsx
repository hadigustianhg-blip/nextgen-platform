"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
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
import { jakartaCurrentMonthRange } from "@/lib/dates/jakarta-date";

type Row = {
  id: string;
  businessDate: string;
  occurredAt: string;
  direction: "IN" | "OUT";
  channel: "CASH" | "BANK";
  movementType: string;
  amount: string;
  description: string | null;
  reference: string | null;
  recordStatus: "VALID" | "VOID";
  runningBalance: string;
  createdBy: string;
  isManual: boolean;
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
    cashOnHand: string;
    bankBalance: string;
    monthlyIncome: string;
    monthlyExpense: string;
  };
};

const money = (value: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const localDate = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const initialSummary = {
  cashOnHand: "0",
  bankBalance: "0",
  monthlyIncome: "0",
  monthlyExpense: "0",
};

export function CashFlowClient({
  canCreate,
  canManage,
  initialDate = "",
}: {
  canCreate: boolean;
  canManage: boolean;
  initialDate?: string;
}) {
  const defaultPeriod = initialDate
    ? { startDate: initialDate, endDate: initialDate }
    : jakartaCurrentMonthRange();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState(initialSummary);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    startDate: defaultPeriod.startDate,
    endDate: defaultPeriod.endDate,
    direction: "",
    channel: "",
    movementType: "",
    reference: "",
    search: "",
  });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"income" | "expense" | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const updateFilter = (key: keyof typeof filters, value: string) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        pageSize: "25",
        ...filters,
      }).toString(),
    [page, filters],
  );
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/cash-flow?${query}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const result = (await response.json()) as Result;
      setRows(result.data);
      setSummary(result.summary);
      setPagination(result.pagination);
    }
    setLoading(false);
  }, [query]);
  useEffect(() => {
    // Loading is intentionally triggered when a server-side query parameter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    setError("");
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(data);
    const response = await fetch(
      editing
        ? `/api/cash-flow/${editing.id}`
        : `/api/cash-flow/manual-${modal}`,
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          requestKey: crypto.randomUUID(),
          occurredAt: editing?.occurredAt ?? new Date().toISOString(),
        }),
      },
    );
    if (!response.ok) {
      setError("Mutasi gagal disimpan. Periksa input.");
      return;
    }
    setModal(null);
    setEditing(null);
    await load();
  }

  async function voidRow(row: Row) {
    const reason = window.prompt("Alasan void");
    if (!reason) return;
    const response = await fetch(`/api/cash-flow/${row.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestKey: crypto.randomUUID(), reason }),
    });
    if (response.ok) await load();
  }

  const categories =
    modal === "income"
      ? [
          "Refund Pembelian",
          "Pengembalian Kasbon",
          "Tambahan Modal",
          "Pendapatan Lain",
          "Koreksi Kas Masuk",
          "Lainnya",
        ]
      : [
          "Tarik Cash Owner",
          "Pindah Kas",
          "Pengeluaran Lain",
          "Koreksi Kas Keluar",
          "Lainnya",
        ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payment"
        title="Cash Flow Payment"
        description="Buku kas dan sumber mutasi uang operasional."
        actions={
          <>
            <button
              onClick={() => void load()}
              className={nextgenNeutralButtonClass}
              aria-label="Refresh"
            >
              <RefreshCw size={18} />
            </button>
            {canCreate && (
              <>
                <button
                  onClick={() => {
                    setEditing(null);
                    setModal("income");
                  }}
                  className={`${nextgenButtonClass} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  <Plus size={16} /> Pemasukan
                </button>
                <button
                  onClick={() => {
                    setEditing(null);
                    setModal("expense");
                  }}
                  className={`${nextgenButtonClass} bg-red-600 text-white hover:bg-red-700`}
                >
                  <Plus size={16} /> Pengeluaran
                </button>
              </>
            )}
          </>
        }
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Cash On Hand Periode", summary.cashOnHand],
          ["Saldo Bank Periode", summary.bankBalance],
          ["Cash Masuk Periode", summary.monthlyIncome],
          ["Cash Keluar Periode", summary.monthlyExpense],
        ].map(([label, value]) => (
          <MetricCard key={label} label={label} value={money(value)} />
        ))}
      </section>
      <FilterCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => updateFilter("startDate", e.target.value)}
            className={nextgenControlClass}
            aria-label="Tanggal mulai"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => updateFilter("endDate", e.target.value)}
            className={nextgenControlClass}
            aria-label="Tanggal akhir"
          />
          <select
            value={filters.direction}
            onChange={(e) => updateFilter("direction", e.target.value)}
            className={nextgenControlClass}
          >
            <option value="">Semua jenis</option>
            <option value="IN">Masuk</option>
            <option value="OUT">Keluar</option>
          </select>
          <select
            value={filters.channel}
            onChange={(e) => updateFilter("channel", e.target.value)}
            className={nextgenControlClass}
          >
            <option value="">Semua channel</option>
            <option>CASH</option>
            <option>BANK</option>
          </select>
          <select
            aria-label="Kategori"
            value={filters.movementType}
            onChange={(e) => updateFilter("movementType", e.target.value)}
            className={nextgenControlClass}
          >
            <option value="">Semua kategori</option>
            {[
              "PICKUP_PAYMENT",
              "DELIVERY_PAYMENT",
              "BANK_DEPOSIT",
              "OPERATIONAL_EXPENSE",
              "CASH_WITHDRAWAL",
              "MANUAL_INCOME",
              "MANUAL_EXPENSE",
              "REFUND",
              "ADJUSTMENT",
              "TRANSFER",
            ].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <input
            placeholder="Reference"
            value={filters.reference}
            onChange={(e) => updateFilter("reference", e.target.value)}
            className={nextgenControlClass}
          />
          <input
            placeholder="Search"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className={nextgenControlClass}
          />
        </div>
      </FilterCard>
      <TableCard
        footer={
          <div className="flex justify-between">
            <span>{pagination.total} mutasi</span>
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
        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Tanggal",
                  "Business Date",
                  "Jenis",
                  "Kategori",
                  "Reference",
                  "Pemasukan",
                  "Pengeluaran",
                  "Saldo",
                  "Channel",
                  "Status",
                  "Input Oleh",
                  "Aksi",
                ].map((x) => (
                  <th key={x} className="px-4 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center">
                    Memuat…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-slate-500">
                    Belum ada transaksi Cash Flow pada periode ini.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      {new Date(row.occurredAt).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4">{row.businessDate.slice(0, 10)}</td>
                    <td className="px-4">{row.direction}</td>
                    <td className="px-4">{row.movementType}</td>
                    <td className="px-4">{row.reference ?? "—"}</td>
                    <td className="px-4 text-emerald-700">
                      {row.direction === "IN" ? money(row.amount) : "—"}
                    </td>
                    <td className="px-4 text-red-700">
                      {row.direction === "OUT" ? money(row.amount) : "—"}
                    </td>
                    <td className="px-4 font-bold">
                      {money(row.runningBalance)}
                    </td>
                    <td className="px-4">{row.channel}</td>
                    <td className="px-4">{row.recordStatus}</td>
                    <td className="px-4">{row.createdBy}</td>
                    <td className="px-4">
                      {canManage &&
                      row.isManual &&
                      row.recordStatus === "VALID" ? (
                        <span className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditing(row);
                              setModal(
                                row.direction === "IN" ? "income" : "expense",
                              );
                            }}
                            className="text-xs font-bold text-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void voidRow(row)}
                            className="text-xs font-bold text-red-600"
                          >
                            Void
                          </button>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableCard>
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <ModalCard className="max-w-lg">
            <form onSubmit={submit} className="space-y-4 p-6">
              <div className="flex justify-between">
                <h2 className="text-xl font-bold">
                  {editing ? "Edit" : "Tambah"}{" "}
                  {modal === "income" ? "Pemasukan" : "Pengeluaran"}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    setEditing(null);
                  }}
                >
                  <X />
                </button>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <input
                name="businessDate"
                type="date"
                defaultValue={editing?.businessDate.slice(0, 10) ?? localDate()}
                required
                className={`w-full ${nextgenControlClass}`}
              />
              <select
                name="category"
                required
                className={`w-full ${nextgenControlClass}`}
              >
                {categories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                name="channel"
                defaultValue={editing?.channel ?? "CASH"}
                className={`w-full ${nextgenControlClass}`}
              >
                <option>CASH</option>
                <option>BANK</option>
              </select>
              <input
                name="amount"
                defaultValue={editing?.amount}
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                placeholder="Nominal"
                required
                className={`w-full ${nextgenControlClass}`}
              />
              <input
                name="reference"
                defaultValue={editing?.reference ?? ""}
                placeholder="Reference"
                className={`w-full ${nextgenControlClass}`}
              />
              <input
                name={modal === "income" ? "source" : "recipient"}
                placeholder={modal === "income" ? "Sumber" : "Penerima"}
                className={`w-full ${nextgenControlClass}`}
              />
              <textarea
                name="description"
                defaultValue={editing?.description ?? ""}
                placeholder="Keterangan"
                className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm"
              />
              <button
                className={`${nextgenButtonClass} w-full bg-blue-600 text-white hover:bg-blue-700`}
              >
                Simpan
              </button>
            </form>
          </ModalCard>
        </div>
      )}
    </div>
  );
}

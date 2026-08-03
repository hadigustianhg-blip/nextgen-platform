"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle, ArrowUpCircle, Download, LoaderCircle, Pencil, Plus,
  Trash2, X,
} from "lucide-react";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { downloadFile } from "@/lib/files/download-file";
import {
  AppCard, FilterCard, MetricCard, ModalCard, PageHeader, SectionCard,
  TableCard, nextgenButtonClass, nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";
import { ProfitLossChart } from "./profit-loss-chart";

type Direction = "INCOME" | "EXPENSE";
type Source = "JFS" | "NEXTGEN_SYSTEM" | "MANUAL" | "ADJUSTMENT";
type Transaction = {
  id: string;
  date: string;
  direction: Direction;
  category: string;
  description: string;
  amount: string;
  source: Source;
  sourceReference: string | null;
  isEditable: boolean;
};
type Result = {
  period: { startDate: string; endDate: string };
  outletCode: string;
  summary: Record<string, string>;
  daily: Array<{
    date: string;
    totalIncome: string;
    totalExpense: string;
    profitLoss: string;
  }>;
  sourceSummary: Array<{
    source: string;
    income: string;
    expense: string;
    difference: string;
  }>;
  categories: string[];
  transactions: Transaction[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  anomalies: string[];
};
type EntryForm = {
  date: string;
  direction: Direction;
  category: string;
  description: string;
  amount: string;
  reference: string;
  reason: string;
};
type TableFilters = {
  search: string;
  source: string;
  category: string;
  sort: string;
  page: number;
};

const money = (value: string | number) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(Number(value));
const today = jakartaOperationalDate();
const monthRange = (date: string) => {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
};
const shiftMonth = (date: string, offset: number) => {
  const current = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  current.setUTCMonth(current.getUTCMonth() + offset);
  return monthRange(current.toISOString().slice(0, 10));
};
const emptyForm: EntryForm = {
  date: today,
  direction: "INCOME",
  category: "",
  description: "",
  amount: "",
  reference: "",
  reason: "",
};
const initialFilters: TableFilters = {
  search: "",
  source: "",
  category: "",
  sort: "newest",
  page: 1,
};

function buildTableQuery(
  startDate: string,
  endDate: string,
  direction: Direction,
  filters: TableFilters,
) {
  return new URLSearchParams({
    startDate,
    endDate,
    direction,
    search: filters.search,
    sort: filters.sort,
    page: String(filters.page),
    pageSize: "25",
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.category ? { category: filters.category } : {}),
  });
}

async function requestProfitLoss(query: URLSearchParams) {
  const response = await fetch(`/api/finance/profit-loss?${query}`, {
    cache: "no-store",
  });
  const responseText = await response.text();
  let body: { data?: Result; error?: { code?: string; message?: string } };
  try {
    body = JSON.parse(responseText) as typeof body;
  } catch {
    console.error("[PROFIT_LOSS_RESPONSE_INVALID]", {
      status: response.status,
      body: responseText,
    });
    throw new Error(`Response Profit Loss tidak valid (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(
      body.error?.message || body.error?.code || "Data Profit Loss gagal dimuat.",
    );
  }
  if (!body.data) throw new Error("Response Profit Loss tidak memiliki data.");
  return body.data;
}

function TransactionSection({
  direction, result, filters, loading, canManage, onFiltersChange,
  onCreate, onAdjustment, onEdit, onVoid,
}: {
  direction: Direction;
  result: Result | null;
  filters: TableFilters;
  loading: boolean;
  canManage: boolean;
  onFiltersChange: (filters: TableFilters) => void;
  onCreate: () => void;
  onAdjustment: () => void;
  onEdit: (row: Transaction) => void;
  onVoid: (row: Transaction) => void;
}) {
  const income = direction === "INCOME";
  const label = income ? "Pemasukan" : "Pengeluaran";
  const rows = result?.transactions ?? [];
  const visibleTotal = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const pagination = result?.pagination ?? {
    page: filters.page,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  };
  const setFilter = (change: Partial<TableFilters>, resetPage = true) =>
    onFiltersChange({ ...filters, ...change, ...(resetPage ? { page: 1 } : {}) });

  return <SectionCard title={`Rincian ${label}`}>
    <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 ${
      income
        ? "border-emerald-100 bg-emerald-50/60 text-emerald-800"
        : "border-orange-100 bg-orange-50/60 text-orange-800"
    }`}>
      {income ? <ArrowUpCircle size={20}/> : <ArrowDownCircle size={20}/>}
      <span className="font-semibold">{label}</span>
    </div>
    <div className="mb-4 flex flex-wrap gap-2">
      {canManage && <>
        <button className={nextgenButtonClass} onClick={onCreate}>
          <Plus size={16}/>Tambah {label}
        </button>
        <button className={nextgenNeutralButtonClass} onClick={onAdjustment}>
          <Plus size={16}/>Adjustment {label}
        </button>
      </>}
    </div>
    <div className="mb-4 grid gap-2 md:grid-cols-4">
      <input
        aria-label={`Cari ${label.toLowerCase()}`}
        placeholder={`Cari ${label.toLowerCase()}`}
        value={filters.search}
        onChange={(event) => setFilter({ search: event.target.value })}
        className={nextgenControlClass}
      />
      <select
        aria-label={`Source ${label}`}
        value={filters.source}
        onChange={(event) => setFilter({ source: event.target.value })}
        className={nextgenControlClass}
      >
        <option value="">Semua Source</option>
        {(["JFS", "NEXTGEN_SYSTEM", "MANUAL", "ADJUSTMENT"] as Source[])
          .map((value) => <option key={value}>{value}</option>)}
      </select>
      <select
        aria-label={`Kategori ${label}`}
        value={filters.category}
        onChange={(event) => setFilter({ category: event.target.value })}
        className={nextgenControlClass}
      >
        <option value="">Semua Kategori</option>
        {(result?.categories ?? []).map((value) =>
          <option key={value}>{value}</option>)}
      </select>
      <select
        aria-label={`Urutan ${label}`}
        value={filters.sort}
        onChange={(event) => setFilter({ sort: event.target.value })}
        className={nextgenControlClass}
      >
        <option value="newest">Terbaru</option>
        <option value="oldest">Terlama</option>
      </select>
    </div>
    <TableCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Keterangan</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3 text-right">Nominal</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && rows.length === 0
              ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Memuat data {label.toLowerCase()}...
                </td></tr>
              : rows.length === 0
                ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada data {label.toLowerCase()} pada periode dan filter ini.
                  </td></tr>
                : rows.map((row) => <tr key={`${row.source}:${row.id}`}>
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3 font-semibold">{row.description}</td>
                    <td className="px-4 py-3">{row.category}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(row.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                        {row.source.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.isEditable && canManage
                        ? <div className="flex gap-2">
                            <button aria-label="Edit" onClick={() => onEdit(row)}>
                              <Pencil size={16}/>
                            </button>
                            <button aria-label="Hapus" onClick={() => onVoid(row)} className="text-rose-700">
                              <Trash2 size={16}/>
                            </button>
                          </div>
                        : "—"}
                    </td>
                  </tr>)}
          </tbody>
          <tfoot className="border-t bg-slate-50">
            <tr>
              <td colSpan={3} className="px-4 py-3 font-bold text-slate-700">
                TOTAL {label.toUpperCase()} TAMPIL
              </td>
              <td className="px-4 py-3 text-right text-base font-bold text-slate-900">
                {money(visibleTotal)}
              </td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>
    </TableCard>
    <div className="mt-3 flex items-center justify-between text-sm">
      <span>{pagination.total} transaksi {label.toLowerCase()}</span>
      <div className="flex gap-2">
        <button
          disabled={filters.page <= 1}
          onClick={() => setFilter({ page: filters.page - 1 }, false)}
          className={nextgenNeutralButtonClass}
        >Sebelumnya</button>
        <button
          disabled={filters.page >= pagination.totalPages}
          onClick={() => setFilter({ page: filters.page + 1 }, false)}
          className={nextgenNeutralButtonClass}
        >Berikutnya</button>
      </div>
    </div>
  </SectionCard>;
}

export function ProfitLossClient({
  canExport,
  canManage,
}: {
  canExport: boolean;
  canManage: boolean;
}) {
  const initial = monthRange(today);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [incomeFilters, setIncomeFilters] = useState(initialFilters);
  const [expenseFilters, setExpenseFilters] = useState(initialFilters);
  const [incomeResult, setIncomeResult] = useState<Result | null>(null);
  const [expenseResult, setExpenseResult] = useState<Result | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [expenseLoading, setExpenseLoading] = useState(true);
  const [incomeError, setIncomeError] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState<null | {
    kind: "manual" | "adjustment";
    row?: Transaction;
  }>(null);
  const [voiding, setVoiding] = useState<Transaction | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const incomeQuery = useMemo(() => buildTableQuery(
    startDate, endDate, "INCOME", incomeFilters,
  ), [startDate, endDate, incomeFilters]);
  const expenseQuery = useMemo(() => buildTableQuery(
    startDate, endDate, "EXPENSE", expenseFilters,
  ), [startDate, endDate, expenseFilters]);
  const exportQuery = useMemo(() => new URLSearchParams({
    startDate,
    endDate,
  }), [startDate, endDate]);

  const loadIncome = useCallback(async () => {
    setIncomeLoading(true);
    setIncomeError("");
    try {
      setIncomeResult(await requestProfitLoss(incomeQuery));
    } catch (cause) {
      setIncomeError(cause instanceof Error
        ? cause.message
        : "Data pemasukan gagal dimuat.");
    } finally {
      setIncomeLoading(false);
    }
  }, [incomeQuery]);
  const loadExpense = useCallback(async () => {
    setExpenseLoading(true);
    setExpenseError("");
    try {
      setExpenseResult(await requestProfitLoss(expenseQuery));
    } catch (cause) {
      setExpenseError(cause instanceof Error
        ? cause.message
        : "Data pengeluaran gagal dimuat.");
    } finally {
      setExpenseLoading(false);
    }
  }, [expenseQuery]);

  useEffect(() => { queueMicrotask(() => void loadIncome()); }, [loadIncome]);
  useEffect(() => { queueMicrotask(() => void loadExpense()); }, [loadExpense]);

  const setMonth = (range: { start: string; end: string }) => {
    setStartDate(range.start);
    setEndDate(range.end);
    setIncomeFilters((current) => ({ ...current, page: 1 }));
    setExpenseFilters((current) => ({ ...current, page: 1 }));
  };
  const openCreate = (
    kind: "manual" | "adjustment",
    direction: Direction,
  ) => {
    setForm({ ...emptyForm, direction });
    setModal({ kind });
  };
  const openEdit = (row: Transaction) => {
    setForm({
      date: row.date,
      direction: row.direction,
      category: row.category,
      description: row.description,
      amount: row.amount,
      reference: row.sourceReference ?? "",
      reason: row.source === "ADJUSTMENT" ? row.sourceReference ?? "" : "",
    });
    setModal({
      kind: row.source === "ADJUSTMENT" ? "adjustment" : "manual",
      row,
    });
  };
  const openVoid = (row: Transaction) => {
    setForm({ ...emptyForm, reason: "" });
    setVoiding(row);
  };
  const reloadTables = async () => {
    await Promise.all([loadIncome(), loadExpense()]);
  };

  async function save() {
    if (!modal || saving) return;
    setSaving(true);
    setActionError("");
    try {
      const base = `/api/finance/profit-loss/${
        modal.kind === "manual" ? "manual" : "adjustments"
      }`;
      const response = await fetch(modal.row ? `${base}/${modal.row.id}` : base, {
        method: modal.row ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      if (!response.ok) throw new Error("Data gagal disimpan.");
      setModal(null);
      await reloadTables();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Data gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function voidRow() {
    if (!voiding || saving || form.reason.trim().length < 3) return;
    setSaving(true);
    setActionError("");
    try {
      const segment = voiding.source === "ADJUSTMENT" ? "adjustments" : "manual";
      const response = await fetch(`/api/finance/profit-loss/${segment}/${voiding.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: form.reason }),
      });
      if (!response.ok) throw new Error("Data gagal dihapus.");
      setVoiding(null);
      await reloadTables();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Data gagal dihapus.");
    } finally {
      setSaving(false);
    }
  }

  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    setActionError("");
    try {
      await downloadFile(`/api/finance/profit-loss/export?${exportQuery}`);
    } catch {
      setActionError("Export gagal. Silakan coba kembali.");
    } finally {
      setExporting(false);
    }
  }

  const result = incomeResult ?? expenseResult;
  const summary = result?.summary;
  const error = actionError || incomeError || expenseError;

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Finance & HR"
      title="Profit Loss"
      description="Analisis pemasukan, pengeluaran, serta laba/rugi operasional berdasarkan periode."
      actions={canExport
        ? <button
            onClick={() => void exportExcel()}
            disabled={exporting}
            className={nextgenNeutralButtonClass}
          >
            {exporting
              ? <LoaderCircle className="animate-spin" size={16}/>
              : <Download size={16}/>}
            {exporting ? "Mengekspor..." : "Export Excel"}
          </button>
        : undefined}
    />
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
      {error}
    </div>}
    <FilterCard>
      <div className="grid gap-3 lg:grid-cols-6">
        <button className={nextgenNeutralButtonClass} onClick={() => setMonth(shiftMonth(startDate, -1))}>Bulan Sebelumnya</button>
        <button className={nextgenNeutralButtonClass} onClick={() => setMonth(monthRange(today))}>Bulan Ini</button>
        <button className={nextgenNeutralButtonClass} onClick={() => setMonth(shiftMonth(startDate, 1))}>Bulan Berikutnya</button>
        <input aria-label="Tanggal Awal" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setIncomeFilters((current) => ({ ...current, page: 1 })); setExpenseFilters((current) => ({ ...current, page: 1 })); }} className={nextgenControlClass}/>
        <input aria-label="Tanggal Akhir" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setIncomeFilters((current) => ({ ...current, page: 1 })); setExpenseFilters((current) => ({ ...current, page: 1 })); }} className={nextgenControlClass}/>
        <button onClick={() => void reloadTables()} className={nextgenButtonClass}>Refresh</button>
      </div>
    </FilterCard>
    {!result && (incomeLoading || expenseLoading)
      ? <div className="grid min-h-64 place-items-center">
          <LoaderCircle className="animate-spin text-blue-700"/>
        </div>
      : result && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Total Pemasukan" value={money(summary!.totalIncome)}/>
            <MetricCard label="Total Pengeluaran" value={money(summary!.totalExpense)}/>
            <MetricCard label={Number(summary!.profitLoss) >= 0 ? "Profit" : "Loss"} value={money(summary!.profitLoss)}/>
            <MetricCard label="Margin Profit" value={`${summary!.margin}%`}/>
            <MetricCard label="Pemasukan JFS" value={money(summary!.jfsIncome)}/>
            <MetricCard label="Omzet Pickup DFOD & Tunai" value={money(Number(summary!.pickupDfod) + Number(summary!.pickupCash))}/>
            <MetricCard label="Pengeluaran JFS" value={money(summary!.jfsExpense)}/>
            <MetricCard label="Total Operasional" value={money(summary!.operational)}/>
            <MetricCard label="Salary Setelah Kasbon" value={money(summary!.salaryNet)}/>
            <MetricCard label="Manual/Adjustment" value={money(summary!.manualAdjustment)}/>
          </div>
          <SectionCard title="Profit / Loss Harian">
            <ProfitLossChart rows={result.daily}/>
          </SectionCard>
          <SectionCard title="Ringkasan Berdasarkan Source">
            <div className="grid gap-3 md:grid-cols-4">
              {result.sourceSummary.map((row) => <AppCard key={row.source} className="p-4">
                <p className="font-bold">{row.source.replace("_", " ")}</p>
                <p className="mt-2 text-sm">Pemasukan: {money(row.income)}</p>
                <p className="text-sm">Pengeluaran: {money(row.expense)}</p>
                <p className="mt-1 font-semibold">Selisih: {money(row.difference)}</p>
              </AppCard>)}
            </div>
            <p className="mt-3 text-xs text-slate-500">{result.anomalies[0]}</p>
          </SectionCard>
          <TransactionSection
            direction="INCOME"
            result={incomeResult}
            filters={incomeFilters}
            loading={incomeLoading}
            canManage={canManage}
            onFiltersChange={setIncomeFilters}
            onCreate={() => openCreate("manual", "INCOME")}
            onAdjustment={() => openCreate("adjustment", "INCOME")}
            onEdit={openEdit}
            onVoid={openVoid}
          />
          <TransactionSection
            direction="EXPENSE"
            result={expenseResult}
            filters={expenseFilters}
            loading={expenseLoading}
            canManage={canManage}
            onFiltersChange={setExpenseFilters}
            onCreate={() => openCreate("manual", "EXPENSE")}
            onAdjustment={() => openCreate("adjustment", "EXPENSE")}
            onEdit={openEdit}
            onVoid={openVoid}
          />
        </>}
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-xl">
        <div className="flex justify-between border-b p-5">
          <h2 className="text-xl font-bold">{modal.kind === "adjustment" ? "Adjustment Profit Loss" : modal.row ? "Edit Data Manual" : "Tambah Data Manual"}</h2>
          <button onClick={() => setModal(null)}><X/></button>
        </div>
        <div className="grid gap-3 p-5">
          <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={nextgenControlClass}/>
          <select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Direction })} className={nextgenControlClass}>
            <option value="INCOME">Pemasukan</option>
            <option value="EXPENSE">Pengeluaran</option>
          </select>
          <input placeholder="Kategori" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={nextgenControlClass}/>
          <input placeholder="Keterangan" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={nextgenControlClass}/>
          <input type="number" min="1" placeholder="Nominal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={nextgenControlClass}/>
          {modal.kind === "manual"
            ? <input placeholder="Referensi (opsional)" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={nextgenControlClass}/>
            : <textarea placeholder="Alasan adjustment" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={nextgenControlClass}/>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button onClick={() => setModal(null)} className={nextgenNeutralButtonClass}>Batal</button>
          <button disabled={saving} onClick={() => void save()} className={nextgenButtonClass}>{saving ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </ModalCard>
    </div>}
    {voiding && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-lg">
        <div className="border-b p-5"><h2 className="text-xl font-bold">Hapus Data Profit Loss</h2></div>
        <div className="space-y-3 p-5">
          <p>Data dipertahankan sebagai histori dan akan di-void.</p>
          <textarea placeholder="Alasan" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={nextgenControlClass}/>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button onClick={() => setVoiding(null)} className={nextgenNeutralButtonClass}>Batal</button>
          <button disabled={saving || form.reason.trim().length < 3} onClick={() => void voidRow()} className="rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white">Void</button>
        </div>
      </ModalCard>
    </div>}
  </div>;
}

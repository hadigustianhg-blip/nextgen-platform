"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";

type Row = {
  id: string; businessDate: string; occurredAt: string; direction: "IN" | "OUT";
  channel: "CASH" | "BANK"; movementType: string; amount: string; description: string | null;
  reference: string | null; recordStatus: "VALID" | "VOID"; runningBalance: string;
  createdBy: string; isManual: boolean;
};
type Result = {
  data: Row[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { cashOnHand: string; bankBalance: string; monthlyIncome: string; monthlyExpense: string };
};

const money = (value: string) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(Number(value));
const localDate = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const initialSummary = { cashOnHand: "0", bankBalance: "0", monthlyIncome: "0", monthlyExpense: "0" };

export function CashFlowClient({ canCreate, canManage, initialDate = "" }: { canCreate: boolean; canManage: boolean; initialDate?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState(initialSummary);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ startDate: initialDate, endDate: initialDate, direction: "", channel: "", movementType: "", reference: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"income" | "expense" | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");

  const query = useMemo(() => new URLSearchParams({
    page: String(page), pageSize: "25", ...filters,
  }).toString(), [page, filters]);
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/cash-flow?${query}`, { cache: "no-store" });
    if (response.ok) {
      const result = await response.json() as Result;
      setRows(result.data); setSummary(result.summary); setPagination(result.pagination);
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
    const response = await fetch(editing ? `/api/cash-flow/${editing.id}` : `/api/cash-flow/manual-${modal}`, {
      method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, requestKey: crypto.randomUUID(), occurredAt: editing?.occurredAt ?? new Date().toISOString() }),
    });
    if (!response.ok) { setError("Mutasi gagal disimpan. Periksa input."); return; }
    setModal(null); setEditing(null); await load();
  }

  async function voidRow(row: Row) {
    const reason = window.prompt("Alasan void");
    if (!reason) return;
    const response = await fetch(`/api/cash-flow/${row.id}/void`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestKey: crypto.randomUUID(), reason }),
    });
    if (response.ok) await load();
  }

  const categories = modal === "income"
    ? ["Refund Pembelian", "Pengembalian Kasbon", "Tambahan Modal", "Pendapatan Lain", "Koreksi Kas Masuk", "Lainnya"]
    : ["Tarik Cash Owner", "Pindah Kas", "Pengeluaran Lain", "Koreksi Kas Keluar", "Lainnya"];

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold text-blue-600">Payment</p><h1 className="text-3xl font-black text-slate-900">Cash Flow Payment</h1><p className="text-sm text-slate-500">Buku kas dan sumber mutasi uang operasional.</p></div>
      <div className="flex gap-2">
        <button onClick={() => void load()} className="rounded-xl border p-2.5" aria-label="Refresh"><RefreshCw size={18} /></button>
        {canCreate && <><button onClick={() => { setEditing(null); setModal("income"); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><Plus size={16} className="inline" /> Pemasukan</button><button onClick={() => { setEditing(null); setModal("expense"); }} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"><Plus size={16} className="inline" /> Pengeluaran</button></>}
      </div>
    </header>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[["Cash On Hand", summary.cashOnHand], ["Saldo Bank", summary.bankBalance], ["Cash Masuk Bulan Ini", summary.monthlyIncome], ["Cash Keluar Bulan Ini", summary.monthlyExpense]].map(([label, value]) => <div key={label} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{money(value)}</p></div>)}
    </section>
    <section className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-4 xl:grid-cols-7">
      <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="rounded-xl border px-3 py-2" aria-label="Tanggal mulai" />
      <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="rounded-xl border px-3 py-2" aria-label="Tanggal akhir" />
      <select value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })} className="rounded-xl border px-3"><option value="">Semua jenis</option><option value="IN">Masuk</option><option value="OUT">Keluar</option></select>
      <select value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })} className="rounded-xl border px-3"><option value="">Semua channel</option><option>CASH</option><option>BANK</option></select>
      <select aria-label="Kategori" value={filters.movementType} onChange={(e) => setFilters({ ...filters, movementType: e.target.value })} className="rounded-xl border px-3 py-2"><option value="">Semua kategori</option>{["PICKUP_PAYMENT","DELIVERY_PAYMENT","BANK_DEPOSIT","OPERATIONAL_EXPENSE","CASH_WITHDRAWAL","MANUAL_INCOME","MANUAL_EXPENSE","REFUND","ADJUSTMENT","TRANSFER"].map((type) => <option key={type}>{type}</option>)}</select>
      <input placeholder="Reference" value={filters.reference} onChange={(e) => setFilters({ ...filters, reference: e.target.value })} className="rounded-xl border px-3 py-2" />
      <input placeholder="Search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="rounded-xl border px-3 py-2" />
    </section>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1250px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Tanggal","Business Date","Jenis","Kategori","Reference","Pemasukan","Pengeluaran","Saldo","Channel","Status","Input Oleh","Aksi"].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={12} className="p-12 text-center">Memuat…</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-4 py-3">{new Date(row.occurredAt).toLocaleString("id-ID")}</td><td className="px-4">{row.businessDate.slice(0,10)}</td><td className="px-4">{row.direction}</td><td className="px-4">{row.movementType}</td><td className="px-4">{row.reference ?? "—"}</td><td className="px-4 text-emerald-700">{row.direction === "IN" ? money(row.amount) : "—"}</td><td className="px-4 text-red-700">{row.direction === "OUT" ? money(row.amount) : "—"}</td><td className="px-4 font-bold">{money(row.runningBalance)}</td><td className="px-4">{row.channel}</td><td className="px-4">{row.recordStatus}</td><td className="px-4">{row.createdBy}</td><td className="px-4">{canManage && row.isManual && row.recordStatus === "VALID" ? <span className="flex gap-2"><button onClick={() => { setEditing(row); setModal(row.direction === "IN" ? "income" : "expense"); }} className="text-xs font-bold text-blue-600">Edit</button><button onClick={() => void voidRow(row)} className="text-xs font-bold text-red-600">Void</button></span> : "—"}</td></tr>)}</tbody></table></div><div className="flex justify-between border-t p-4 text-sm"><span>{pagination.total} mutasi</span><div className="flex gap-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button><span>{page} / {Math.max(1, pagination.totalPages)}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Berikutnya</button></div></div></section>
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-black">{editing ? "Edit" : "Tambah"} {modal === "income" ? "Pemasukan" : "Pengeluaran"}</h2><button type="button" onClick={() => { setModal(null); setEditing(null); }}><X /></button></div>{error && <p className="text-sm text-red-600">{error}</p>}<input name="businessDate" type="date" defaultValue={editing?.businessDate.slice(0, 10) ?? localDate()} required className="w-full rounded-xl border p-3" /><select name="category" required className="w-full rounded-xl border p-3">{categories.map((x) => <option key={x}>{x}</option>)}</select><select name="channel" defaultValue={editing?.channel ?? "CASH"} className="w-full rounded-xl border p-3"><option>CASH</option><option>BANK</option></select><input name="amount" defaultValue={editing?.amount} inputMode="numeric" pattern="[1-9][0-9]*" placeholder="Nominal" required className="w-full rounded-xl border p-3" /><input name="reference" defaultValue={editing?.reference ?? ""} placeholder="Reference" className="w-full rounded-xl border p-3" /><input name={modal === "income" ? "source" : "recipient"} placeholder={modal === "income" ? "Sumber" : "Penerima"} className="w-full rounded-xl border p-3" /><textarea name="description" defaultValue={editing?.description ?? ""} placeholder="Keterangan" className="w-full rounded-xl border p-3" /><button className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white">Simpan</button></form></div>}
  </div>;
}

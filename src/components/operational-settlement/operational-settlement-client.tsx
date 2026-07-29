"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Search, X } from "lucide-react";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

const categories = ["BBM", "Kasbon", "Parkir", "Tol", "Pembelian POP", "Perawatan Kendaraan", "ATK", "Konsumsi", "Biaya Bongkar Muat", "Lainnya"];
const cashAdvanceCategories = ["Pribadi", "Transport", "Makan", "Pinjaman", "Lainnya"];
const digits = (value: string) => value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "") || "0";
const money = (value: string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(BigInt(value.split(".")[0] || "0"));
const dateTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));

type Expense = {
  id: string; operationalDate: string; createdAt: string; category: string; amount: string;
  description: string | null; teamName: string | null; cashAdvanceCategory: string | null;
  vehiclePlate: string | null; status: "VALID" | "VOID"; createdBy: string;
};
type Summary = { cashCollected: string; operationalExpense: string; cashAvailable: string; transferCollected: string; outstanding: string };
type Closing = { status: "OPEN" | "REOPENED" | "CLOSED"; physicalCash: string; cashVariance: string | null; varianceStatus: "NOT_SET" | "MATCH" | "SHORT" | "OVER"; closedAt: string | null; reopenReason: string | null; bankDepositAmount: string; bankDepositAccount: string | null; bankDepositReference: string | null; bankDepositNote: string | null; remainingCashAfterDeposit: string };
const emptySummary: Summary = { cashCollected: "0", operationalExpense: "0", cashAvailable: "0", transferCollected: "0", outstanding: "0" };

export function OperationalSettlementClient({ outletCode, canAdmin }: { outletCode: string; canAdmin: boolean }) {
  const [operationalDate, setOperationalDate] = useState("");
  const [calendarDate, setCalendarDate] = useState(jakartaOperationalDate);
  const [openDayCount, setOpenDayCount] = useState(0);
  const [isPastDueOpenDay, setIsPastDueOpenDay] = useState(false);
  const [category, setCategory] = useState("");
  const [team, setTeam] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [closing, setClosing] = useState<Closing>({ status: "OPEN", physicalCash: "0", cashVariance: null, varianceStatus: "NOT_SET", closedAt: null, reopenReason: null, bankDepositAmount: "0", bankDepositAccount: null, bankDepositReference: null, bankDepositNote: null, remainingCashAfterDeposit: "0" });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [teams, setTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<Expense | null | "new">(null);
  const [formCategory, setFormCategory] = useState("BBM");
  const [amount, setAmount] = useState("0");
  const [description, setDescription] = useState("");
  const [teamName, setTeamName] = useState("");
  const [cashAdvanceCategory, setCashAdvanceCategory] = useState("Pribadi");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [physicalCash, setPhysicalCash] = useState("0");
  const [bankDepositAmount, setBankDepositAmount] = useState("0");
  const [bankDepositAccount, setBankDepositAccount] = useState("");
  const [bankDepositReference, setBankDepositReference] = useState("");
  const [bankDepositNote, setBankDepositNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const query = useMemo(() => new URLSearchParams({
    page: String(page), pageSize: String(pageSize), operationalDate, category, team, search,
  }).toString(), [page, pageSize, operationalDate, category, team, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/operational-settlement?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setRows(body.data); setSummary(body.summary); setClosing(body.closing);
      if (!operationalDate) setOperationalDate(body.selectedOperationalDate);
      setCalendarDate(body.calendarDate); setOpenDayCount(body.openDayCount);
      setIsPastDueOpenDay(body.isPastDueOpenDay);
      setPhysicalCash(body.closing.physicalCash); setPagination(body.pagination);
      setBankDepositAmount(body.closing.bankDepositAmount);
      setBankDepositAccount(body.closing.bankDepositAccount ?? "");
      setBankDepositReference(body.closing.bankDepositReference ?? "");
      setBankDepositNote(body.closing.bankDepositNote ?? "");
    } catch { setNotice({ tone: "error", text: "Operational Settlement belum dapat dimuat." }); }
    finally { setLoading(false); }
  }, [query, operationalDate]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => { queueMicrotask(async () => {
    const response = await fetch("/api/operational-settlement/teams", { cache: "no-store" });
    if (response.ok) setTeams((await response.json()).data);
  }); }, []);

  function openExpense(row?: Expense) {
    if (closing.status === "CLOSED") return;
    setEditing(row ?? "new"); setFormCategory(row?.category ?? "BBM");
    setAmount(row?.amount ?? "0"); setDescription(row?.description ?? "");
    setTeamName(row?.teamName ?? ""); setCashAdvanceCategory(row?.cashAdvanceCategory ?? "Pribadi");
    setVehiclePlate(row?.vehiclePlate ?? "");
  }

  async function saveExpense() {
    if (!editing || saving || !operationalDate) return;
    setSaving(true); setNotice(null);
    const isNew = editing === "new";
    try {
      const response = await fetch(isNew ? "/api/operational-settlement/expenses" : `/api/operational-settlement/expenses/${editing.id}`, {
        method: isNew ? "POST" : "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(),
          ...(isNew ? { operationalDate } : {}),
          category: formCategory, amount: digits(amount), description: description || null,
          teamName: formCategory === "Kasbon" ? teamName || null : null,
          cashAdvanceCategory: formCategory === "Kasbon" ? cashAdvanceCategory : null,
          vehiclePlate: formCategory === "BBM" ? vehiclePlate || null : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setEditing(null); setNotice({ tone: "success", text: `Pengeluaran berhasil ${isNew ? "ditambahkan" : "diperbarui"}.` }); await load();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Pengeluaran gagal disimpan." }); }
    finally { setSaving(false); }
  }

  async function voidExpense(row: Expense) {
    if (saving || closing.status === "CLOSED") return;
    setSaving(true);
    try {
      const response = await fetch(`/api/operational-settlement/expenses/${row.id}/void`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestKey: crypto.randomUUID(), reason: "Dibatalkan oleh admin operasional" }),
      });
      if (!response.ok) throw new Error();
      setNotice({ tone: "success", text: "Pengeluaran dibatalkan tanpa menghapus histori." }); await load();
    } catch { setNotice({ tone: "error", text: "Pengeluaran tidak dapat dibatalkan." }); }
    finally { setSaving(false); }
  }

  async function closeDay() {
    if (!operationalDate || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/operational-settlement/closing", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestKey: crypto.randomUUID(), operationalDate,
          bankDepositAmount: digits(bankDepositAmount),
          bankDepositAccount: bankDepositAccount || null,
          bankDepositReference: bankDepositReference || null,
          bankDepositNote: bankDepositNote || null,
          physicalCash: digits(physicalCash),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setOperationalDate(body.data.nextBusinessDate);
      setNotice({ tone: "success", text: "Operasional harian berhasil ditutup." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Operasional belum dapat ditutup." }); }
    finally { setSaving(false); }
  }

  async function reopenDay() {
    if (!operationalDate || saving || reopenReason.trim().length < 3) return;
    setSaving(true);
    try {
      const response = await fetch("/api/operational-settlement/closing/reopen", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestKey: crypto.randomUUID(), operationalDate, reason: reopenReason }),
      });
      if (!response.ok) throw new Error();
      setReopenReason(""); setNotice({ tone: "success", text: "Operasional dibuka kembali." }); await load();
    } catch { setNotice({ tone: "error", text: "Operasional tidak dapat dibuka kembali." }); }
    finally { setSaving(false); }
  }

  const remainingCash = BigInt(summary.cashAvailable.split(".")[0] || "0") - BigInt(digits(bankDepositAmount));
  const variance = BigInt(digits(physicalCash)) - remainingCash;
  const varianceLabel = variance === 0n ? "Sesuai" : variance < 0n ? "Kurang Kas" : "Lebih Kas";

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-blue-600">Settlement Center</p><h1 className="mt-1 text-3xl font-bold">Operational Settlement</h1><p className="mt-2 text-slate-600">Kelola pengeluaran dan closing cash operasional harian.</p></div><div className="rounded-xl border bg-white px-4 py-3 text-sm">Outlet <b>{outletCode}</b></div></div>
    {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</div>}
    {isPastDueOpenDay && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900"><p className="font-semibold">{openDayCount > 1 ? `Masih ada ${openDayCount} hari operasional yang belum ditutup. Sistem membuka tanggal paling lama terlebih dahulu.` : `Masih ada operasional ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${operationalDate}T00:00:00Z`))} yang belum ditutup.`}</p><a href="#closing-harian" className="rounded-xl bg-amber-900 px-4 py-2 text-sm font-bold text-white">Lanjutkan Closing</a></div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{[
      ["Cash Diterima", summary.cashCollected], ["Pengeluaran Operasional", summary.operationalExpense],
      ["Cash Tersedia", summary.cashAvailable], ["Transfer Diterima", summary.transferCollected],
      ["Belum Diterima", summary.outstanding],
    ].map(([label, value]) => <article key={label} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-3 text-2xl font-extrabold">{money(value)}</p>{label === "Cash Tersedia" && closing.status === "CLOSED" && <p className="mt-2 text-xs text-slate-500">Setor Bank {money(closing.bankDepositAmount)} · Sisa Cash {money(closing.remainingCashAfterDeposit)}</p>}</article>)}</div>
    <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <input aria-label="Tanggal" type="date" value={operationalDate} onChange={(event) => { setOperationalDate(event.target.value); setPage(1); }} className="h-10 rounded-xl border px-3 text-sm" />
      <select aria-label="Kategori" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="h-10 rounded-xl border px-3 text-sm"><option value="">Semua kategori</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <input list="operational-team-filter" aria-label="Nama Team" value={team} onChange={(event) => { setTeam(event.target.value); setPage(1); }} placeholder="Nama team" className="h-10 rounded-xl border px-3 text-sm" /><datalist id="operational-team-filter">{teams.map((item) => <option key={item} value={item} />)}</datalist>
      <label className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input aria-label="Search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari…" className="h-10 w-full rounded-xl border pl-9 pr-3 text-sm" /></label>
      <select aria-label="Jumlah baris" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-10 rounded-xl border px-3 text-sm">{[10,25,50,100].map((size) => <option key={size} value={size}>{size} baris</option>)}</select>
      <button disabled={!operationalDate || closing.status === "CLOSED"} onClick={() => openExpense()} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"><Plus size={16} />Tambah Pengeluaran</button>
    </div></section>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Waktu","Kategori","Nama Team / No Polisi","Keterangan","Nominal","Status","Input Oleh","Aksi"].map((item) => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={8} className="py-14 text-center"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="py-14 text-center text-slate-500">Belum ada pengeluaran.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-4 py-3">{dateTime(row.createdAt)}</td><td className="px-4 py-3 font-semibold">{row.category}</td><td className="px-4 py-3">{row.teamName ?? row.vehiclePlate ?? "—"}</td><td className="px-4 py-3">{row.description ?? "—"}</td><td className="px-4 py-3 font-semibold">{money(row.amount)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${row.status === "VALID" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.status}</span></td><td className="px-4 py-3">{row.createdBy}</td><td className="px-4 py-3"><div className="flex gap-2"><button disabled={row.status === "VOID" || closing.status === "CLOSED"} onClick={() => openExpense(row)} className="rounded-lg border px-2 py-1 disabled:opacity-40"><Pencil size={14} /></button><button disabled={row.status === "VOID" || closing.status === "CLOSED"} onClick={() => void voidExpense(row)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600 disabled:opacity-40">Void</button></div></td></tr>)}</tbody></table></div><div className="flex justify-between border-t p-4 text-sm"><span>{pagination.total} data</span><div className="flex gap-3"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button><span>{page} / {Math.max(1,pagination.totalPages)}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button></div></div></section>
    <section id="closing-harian" className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Closing Harian</h2><p className="mt-1 text-sm text-slate-500">Business Date: <b>{operationalDate}</b> · Calendar Date: {calendarDate}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${closing.status === "CLOSED" ? "bg-slate-900 text-white" : "bg-emerald-100 text-emerald-700"}`}>{closing.status}</span></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Cash Tersedia Sebelum Setor</p><p className="mt-1 text-lg font-bold">{money(summary.cashAvailable)}</p></div>
      <label className="text-sm font-semibold">Setor Bank<input disabled={closing.status === "CLOSED"} inputMode="numeric" value={bankDepositAmount} onChange={(event) => setBankDepositAmount(digits(event.target.value))} className="mt-1 h-11 w-full rounded-xl border px-3 disabled:bg-slate-50" /></label>
      <label className="text-sm font-semibold">Rekening Tujuan<input disabled={closing.status === "CLOSED"} value={bankDepositAccount} onChange={(event) => setBankDepositAccount(event.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 disabled:bg-slate-50" /></label>
      <label className="text-sm font-semibold">Nomor Referensi<input disabled={closing.status === "CLOSED"} value={bankDepositReference} onChange={(event) => setBankDepositReference(event.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 disabled:bg-slate-50" /></label>
      <label className="text-sm font-semibold">Keterangan Setor Bank<input disabled={closing.status === "CLOSED"} value={bankDepositNote} onChange={(event) => setBankDepositNote(event.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 disabled:bg-slate-50" /></label>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Sisa Cash Sistem</p><p className="mt-1 text-lg font-bold">{money(String(remainingCash))}</p></div>
      <label className="text-sm font-semibold">Physical Cash<input disabled={closing.status === "CLOSED"} inputMode="numeric" value={physicalCash} onChange={(event) => setPhysicalCash(digits(event.target.value))} className="mt-1 h-11 w-full rounded-xl border px-3 disabled:bg-slate-50" /></label>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Cash Variance</p><p className="mt-1 text-lg font-bold">{money(String(variance < 0n ? -variance : variance))}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Status</p><p className="mt-1 text-lg font-bold">{varianceLabel}</p></div></div>{closing.status !== "CLOSED" ? <button disabled={!operationalDate || saving || !canAdmin} onClick={() => void closeDay()} className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white disabled:opacity-40">Tutup Operasional</button> : canAdmin && <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Alasan buka kembali" className="h-11 flex-1 rounded-xl border px-3" /><button disabled={saving || reopenReason.trim().length < 3} onClick={() => void reopenDay()} className="rounded-xl border border-amber-300 px-5 py-2.5 font-bold text-amber-700 disabled:opacity-40">Buka Kembali</button></div>}</section>
    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-3xl bg-white shadow-2xl"><div className="flex justify-between border-b p-5"><div><p className="text-sm font-semibold text-blue-600">Operational Settlement</p><h2 className="text-2xl font-bold">{editing === "new" ? "Tambah" : "Edit"} Pengeluaran</h2></div><button onClick={() => setEditing(null)}><X /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><label className="text-sm font-semibold">Tanggal<input type="date" disabled value={editing === "new" ? operationalDate : editing.operationalDate.slice(0,10)} className="mt-1 h-11 w-full rounded-xl border px-3 disabled:bg-slate-50" /></label><label className="text-sm font-semibold">Kategori<select value={formCategory} onChange={(event) => setFormCategory(event.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3">{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-semibold sm:col-span-2">Nominal<input inputMode="numeric" value={amount} onChange={(event) => setAmount(digits(event.target.value))} className="mt-1 h-11 w-full rounded-xl border px-3" /></label>{formCategory === "BBM" && <label className="text-sm font-semibold sm:col-span-2">Nomor Polisi<input value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)} placeholder="D8634AB" className="mt-1 h-11 w-full rounded-xl border px-3" /></label>}{formCategory === "Kasbon" && <><label className="text-sm font-semibold">Nama Team<input list="operational-team-form" value={teamName} onChange={(event) => setTeamName(event.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3" /><datalist id="operational-team-form">{teams.map((item) => <option key={item} value={item} />)}</datalist></label><label className="text-sm font-semibold">Kategori Kasbon<select value={cashAdvanceCategory} onChange={(event) => setCashAdvanceCategory(event.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3">{cashAdvanceCategories.map((item) => <option key={item}>{item}</option>)}</select></label></>}<label className="text-sm font-semibold sm:col-span-2">Keterangan<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} className="mt-1 min-h-24 w-full rounded-xl border p-3" /></label></div><div className="flex justify-end gap-3 border-t p-4"><button onClick={() => setEditing(null)} className="rounded-xl border px-5 py-2.5 font-semibold">Batal</button><button disabled={saving} onClick={() => void saveExpense()} className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white disabled:opacity-50">Simpan</button></div></div></div>}
  </div>;
}

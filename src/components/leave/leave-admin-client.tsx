"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Eye, RefreshCw, XCircle } from "lucide-react";
import { AppCard, PageHeader, nextgenButtonClass, nextgenControlClass } from "@/components/ui";

type LeaveType = "LEAVE" | "PERMISSION" | "SICK";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type Row = { id: string; type: LeaveType; startDate: string; endDate: string; reason: string; status: LeaveStatus; submittedAt: string; reviewNotes: string | null; employee: { id: string; name: string; division: string }; reviewer: { id: string; name: string } | null };
type Summary = Record<LeaveStatus, number>;
type ApiBody = { success?: boolean; data?: Row[] | Row; summary?: Summary; pagination?: { page: number; pageSize: number; total: number }; error?: { code?: string } };
const typeLabels: Record<LeaveType, string> = { LEAVE: "Cuti", PERMISSION: "Izin", SICK: "Sakit" };
const statusLabels: Record<LeaveStatus, string> = { PENDING: "Pending", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan" };
const badgeStyles: Record<LeaveStatus, string> = { PENDING: "bg-amber-50 text-amber-700", APPROVED: "bg-emerald-50 text-emerald-700", REJECTED: "bg-red-50 text-red-700", CANCELLED: "bg-slate-100 text-slate-600" };
const safeErrors: Record<string, string> = { FORBIDDEN: "Anda tidak memiliki izin untuk tindakan ini.", LEAVE_NOT_PENDING: "Pengajuan sudah diproses oleh user lain.", VALIDATION_ERROR: "Catatan review belum valid." };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: ApiBody | null = null;
  try { body = text ? JSON.parse(text) as ApiBody : null; } catch { body = null; }
  if (!response.ok || !body?.success) throw new Error(safeErrors[body?.error?.code ?? ""] ?? "Permintaan Pengajuan Team gagal.");
  return body;
}

export function LeaveAdminClient({ canReview }: { canReview: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 });
  const [filters, setFilters] = useState({ startDate: "", endDate: "", search: "", type: "", status: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [action, setAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "25" });
      Object.entries(filters).forEach(([key, value]) => { if (value.trim()) query.set(key, value.trim()); });
      const response = await api(`/api/hr/leave?${query}`);
      setRows(response.data as Row[]); setSummary(response.summary ?? { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 }); setTotal(response.pagination?.total ?? 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Data gagal dimuat."); }
    finally { setLoading(false); }
  }, [filters, page]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function review() {
    if (!selected || !action || saving || (action === "REJECT" && notes.trim().length < 5)) return;
    setSaving(true); setError("");
    try {
      await api(`/api/hr/leave/${selected.id}/${action === "APPROVE" ? "approve" : "reject"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewNotes: notes.trim() || undefined }) });
      setSelected(null); setAction(null); setNotes(""); setMessage(action === "APPROVE" ? "Pengajuan disetujui." : "Pengajuan ditolak."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review gagal disimpan."); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Pengajuan Team" description="Review pengajuan cuti, izin, dan sakit per outlet." />
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Pending" value={summary.PENDING} tone="amber"/><SummaryCard label="Disetujui" value={summary.APPROVED} tone="emerald"/><SummaryCard label="Ditolak" value={summary.REJECTED} tone="red"/><SummaryCard label="Dibatalkan" value={summary.CANCELLED} tone="slate"/></div>
    <AppCard className="overflow-hidden"><div className="border-b border-slate-200 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">Daftar Pengajuan</h2><button type="button" onClick={() => void load()} className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700`}><RefreshCw size={17}/> Refresh</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><input type="date" aria-label="Tanggal awal" className={nextgenControlClass} value={filters.startDate} onChange={(event) => { setPage(1); setFilters({ ...filters, startDate: event.target.value }); }}/><input type="date" aria-label="Tanggal akhir" className={nextgenControlClass} value={filters.endDate} onChange={(event) => { setPage(1); setFilters({ ...filters, endDate: event.target.value }); }}/><input aria-label="Cari nama" className={nextgenControlClass} placeholder="Cari nama team" value={filters.search} onChange={(event) => { setPage(1); setFilters({ ...filters, search: event.target.value }); }}/><select aria-label="Jenis" className={nextgenControlClass} value={filters.type} onChange={(event) => { setPage(1); setFilters({ ...filters, type: event.target.value }); }}><option value="">Semua Jenis</option><option value="LEAVE">Cuti</option><option value="PERMISSION">Izin</option><option value="SICK">Sakit</option></select><select aria-label="Status" className={nextgenControlClass} value={filters.status} onChange={(event) => { setPage(1); setFilters({ ...filters, status: event.target.value }); }}><option value="">Semua Status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead><tr className="bg-slate-50 text-left text-slate-500">{["Nama","Divisi","Jenis","Tanggal","Alasan","Status","Diajukan","Aksi"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3 font-bold text-slate-900">{row.employee.name}</td><td className="px-4 py-3">{row.employee.division}</td><td className="px-4 py-3">{typeLabels[row.type]}</td><td className="px-4 py-3">{row.startDate}<br/>{row.endDate}</td><td className="max-w-56 truncate px-4 py-3">{row.reason}</td><td className="px-4 py-3"><StatusBadge status={row.status}/></td><td className="px-4 py-3">{new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(row.submittedAt))}</td><td className="px-4 py-3"><button type="button" onClick={() => { setSelected(row); setAction(null); setNotes(row.reviewNotes ?? ""); }} aria-label={`Detail ${row.employee.name}`} className="grid size-11 place-items-center rounded-xl text-blue-700 hover:bg-blue-50"><Eye size={18}/></button></td></tr>)}</tbody></table>{!loading && rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Belum ada pengajuan pada filter ini.</p>}{loading && <p className="p-8 text-center text-sm text-slate-500">Memuat pengajuan…</p>}</div>
      <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm text-slate-500"><span>{total} pengajuan</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-xl border border-slate-200 px-4 disabled:opacity-40">Sebelumnya</button><button type="button" disabled={page * 25 >= total} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-xl border border-slate-200 px-4 disabled:opacity-40">Berikutnya</button></div></div>
    </AppCard>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-label="Detail pengajuan" className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">{selected.employee.name}</h2><p className="text-sm text-slate-500">{selected.employee.division} · {typeLabels[selected.type]}</p></div><StatusBadge status={selected.status}/></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Detail label="Tanggal Mulai" value={selected.startDate}/><Detail label="Tanggal Selesai" value={selected.endDate}/></div><Detail label="Alasan" value={selected.reason}/>{selected.reviewNotes && <Detail label="Catatan Review" value={selected.reviewNotes}/>} {canReview && selected.status === "PENDING" && <div className="mt-5 space-y-3"><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setAction("APPROVE")} className={`min-h-11 rounded-xl border font-bold ${action === "APPROVE" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700"}`}><CheckCircle2 className="mr-1 inline" size={17}/> Setujui</button><button type="button" onClick={() => setAction("REJECT")} className={`min-h-11 rounded-xl border font-bold ${action === "REJECT" ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200 text-slate-700"}`}><XCircle className="mr-1 inline" size={17}/> Tolak</button></div>{action && <label className="block text-sm font-semibold text-slate-700"><span className="mb-1.5 block">Catatan Review {action === "REJECT" ? "(wajib)" : "(opsional)"}</span><textarea className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-base" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000}/></label>} {action && <button type="button" disabled={saving || (action === "REJECT" && notes.trim().length < 5)} onClick={() => void review()} className={`min-h-11 w-full rounded-xl font-bold text-white disabled:opacity-45 ${action === "APPROVE" ? "bg-emerald-600" : "bg-red-600"}`}>{saving ? "Menyimpan…" : "Konfirmasi Review"}</button>}</div>}<button type="button" disabled={saving} onClick={() => { setSelected(null); setAction(null); }} className="mt-5 min-h-11 w-full rounded-xl border border-slate-200 font-bold text-slate-700">Tutup</button></section></div>}
  </div>;
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "red" | "slate" }) { const color = { amber: "text-amber-600 bg-amber-50", emerald: "text-emerald-600 bg-emerald-50", red: "text-red-600 bg-red-50", slate: "text-slate-600 bg-slate-100" }[tone]; return <AppCard className="p-5"><span className={`grid size-11 place-items-center rounded-2xl ${color}`}><Clock3 size={20}/></span><p className="mt-4 text-sm font-semibold text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></AppCard>; }
function StatusBadge({ status }: { status: LeaveStatus }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${badgeStyles[status]}`}>{statusLabels[status]}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{value}</p></div>; }

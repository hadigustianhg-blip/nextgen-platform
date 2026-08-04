"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronRight, Clock3, FileText, Plus, Stethoscope, X } from "lucide-react";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type LeaveType = "LEAVE" | "PERMISSION" | "SICK";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type LeaveRow = { id: string; type: LeaveType; startDate: string; endDate: string; reason: string; status: LeaveStatus; submittedAt: string; cancelledAt: string | null; reviewedAt: string | null; reviewNotes: string | null };
type ApiBody = { success?: boolean; data?: LeaveRow[] | LeaveRow; pagination?: { page: number; pageSize: number; total: number }; error?: { code?: string } };

const typeLabels: Record<LeaveType, string> = { LEAVE: "Cuti", PERMISSION: "Izin", SICK: "Sakit" };
const statusLabels: Record<LeaveStatus, string> = { PENDING: "Pending", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan" };
const statusStyles: Record<LeaveStatus, string> = { PENDING: "bg-amber-50 text-amber-700", APPROVED: "bg-emerald-50 text-emerald-700", REJECTED: "bg-red-50 text-red-700", CANCELLED: "bg-slate-100 text-slate-600" };
const safeErrors: Record<string, string> = { LEAVE_DUPLICATE: "Pengajuan identik masih menunggu review.", LEAVE_NOT_PENDING: "Pengajuan ini sudah tidak dapat dibatalkan.", LEAVE_NOT_FOUND: "Pengajuan tidak ditemukan.", VALIDATION_ERROR: "Periksa kembali data pengajuan." };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: ApiBody | null = null;
  try { body = text ? JSON.parse(text) as ApiBody : null; } catch { body = null; }
  if (!response.ok || !body?.success) throw new Error(safeErrors[body?.error?.code ?? ""] ?? "Permintaan pengajuan gagal.");
  return body;
}

const formatDate = (value: string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(`${value}T00:00:00+07:00`));
const emptyForm = (type: LeaveType = "LEAVE") => ({ type, startDate: jakartaOperationalDate(), endDate: jakartaOperationalDate(), reason: "" });

export function TeamLeaveClient() {
  const [filter, setFilter] = useState<"ALL" | LeaveStatus>("ALL");
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [selected, setSelected] = useState<LeaveRow | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: "1", pageSize: "50" });
      if (filter !== "ALL") query.set("status", filter);
      const response = await api(`/api/team/leave?${query}`);
      setRows(response.data as LeaveRow[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Riwayat gagal dimuat."); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    const requestedType = new URLSearchParams(window.location.search).get("type");
    if (["LEAVE", "PERMISSION", "SICK"].includes(requestedType ?? "")) {
      queueMicrotask(() => { setForm(emptyForm(requestedType as LeaveType)); setShowForm(true); });
    }
  }, []);

  const formError = useMemo(() => {
    if (!form.startDate || !form.endDate) return "Tanggal mulai dan selesai wajib diisi.";
    if (form.endDate < form.startDate) return "Tanggal selesai tidak boleh sebelum tanggal mulai.";
    if (form.reason.trim().length < 5) return "Alasan minimal 5 karakter.";
    return "";
  }, [form]);

  function openForm(type: LeaveType) { setForm(emptyForm(type)); setShowForm(true); setError(""); setMessage(""); }

  async function submit() {
    if (submitting || formError) return;
    setSubmitting(true); setError("");
    try {
      await api("/api/team/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, reason: form.reason.trim() }) });
      setShowForm(false); setConfirmSubmit(false); setMessage("Pengajuan berhasil dikirim."); await load();
    } catch (cause) { setConfirmSubmit(false); setError(cause instanceof Error ? cause.message : "Pengajuan gagal dikirim."); }
    finally { setSubmitting(false); }
  }

  async function cancel() {
    if (!selected || submitting) return;
    setSubmitting(true); setError("");
    try {
      await api(`/api/team/leave/${selected.id}/cancel`, { method: "PATCH" });
      setSelected(null); setConfirmCancel(false); setMessage("Pengajuan berhasil dibatalkan."); await load();
    } catch (cause) { setConfirmCancel(false); setError(cause instanceof Error ? cause.message : "Pembatalan gagal."); }
    finally { setSubmitting(false); }
  }

  return <div className="space-y-5">
    <header><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Team Self Service</p><h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">Pengajuan</h1><p className="mt-1 text-sm leading-6 text-slate-500">Ajukan cuti, izin, atau sakit dan pantau statusnya.</p></header>
    {message && <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</p>}{error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
    <section className="grid grid-cols-3 gap-3" aria-label="Aksi pengajuan"><QuickAction label="Cuti" icon={CalendarDays} onClick={() => openForm("LEAVE")} /><QuickAction label="Izin" icon={Clock3} onClick={() => openForm("PERMISSION")} /><QuickAction label="Sakit" icon={Stethoscope} onClick={() => openForm("SICK")} /></section>
    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter status">{(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ${filter === value ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{value === "ALL" ? "Semua" : statusLabels[value]}</button>)}</div>
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-slate-950">Riwayat Pengajuan</h2><button type="button" onClick={() => openForm("LEAVE")} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs font-extrabold text-blue-700"><Plus size={16}/> Baru</button></div>
      {loading ? <p className="rounded-[22px] border border-slate-200 bg-white p-5 text-sm text-slate-500">Memuat pengajuan…</p> : rows.length === 0 ? <p className="rounded-[22px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada pengajuan pada filter ini.</p> : rows.map((row) => <button type="button" key={row.id} onClick={() => setSelected(row)} className="flex min-h-28 w-full items-center gap-4 rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.04)]"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><FileText size={20}/></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">{typeLabels[row.type]}</strong><StatusBadge status={row.status}/></span><span className="mt-2 block text-xs font-semibold text-slate-500">{formatDate(row.startDate)} — {formatDate(row.endDate)}</span><span className="mt-1 block truncate text-xs text-slate-500">{row.reason}</span></span><ChevronRight size={18} className="shrink-0 text-slate-400"/></button>)}
    </section>
    {showForm && <Sheet title={`Ajukan ${typeLabels[form.type]}`} onClose={() => !submitting && setShowForm(false)}><div className="space-y-4"><Field label="Jenis"><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as LeaveType })} className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base"><option value="LEAVE">Cuti</option><option value="PERMISSION">Izin</option><option value="SICK">Sakit</option></select></Field><div className="grid grid-cols-2 gap-3"><Field label="Tanggal Mulai"><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="min-h-12 min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 text-base"/></Field><Field label="Tanggal Selesai"><input type="date" value={form.endDate} min={form.startDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className="min-h-12 min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 text-base"/></Field></div><Field label="Alasan"><textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} rows={4} maxLength={1000} placeholder="Tuliskan alasan minimal 5 karakter" className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base"/></Field>{formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}<button type="button" disabled={Boolean(formError) || submitting} onClick={() => setConfirmSubmit(true)} className="min-h-12 w-full rounded-2xl bg-blue-600 px-4 text-sm font-extrabold text-white disabled:opacity-45">Kirim Pengajuan</button></div></Sheet>}
    {confirmSubmit && <Confirm title="Kirim pengajuan?" description={`${typeLabels[form.type]} untuk ${formatDate(form.startDate)} — ${formatDate(form.endDate)} akan dikirim untuk direview.`} busy={submitting} onCancel={() => setConfirmSubmit(false)} onConfirm={() => void submit()} confirmLabel="Ya, Kirim"/>}
    {selected && <Sheet title="Detail Pengajuan" onClose={() => setSelected(null)}><div className="space-y-4"><div className="flex items-center justify-between"><strong className="text-lg text-slate-950">{typeLabels[selected.type]}</strong><StatusBadge status={selected.status}/></div><Detail label="Tanggal" value={`${formatDate(selected.startDate)} — ${formatDate(selected.endDate)}`}/><Detail label="Alasan" value={selected.reason}/>{selected.reviewNotes && <Detail label="Catatan Review" value={selected.reviewNotes}/>} {selected.status === "PENDING" && <button type="button" onClick={() => setConfirmCancel(true)} className="min-h-12 w-full rounded-2xl border border-red-200 bg-red-50 text-sm font-extrabold text-red-700">Batalkan Pengajuan</button>}</div></Sheet>}
    {confirmCancel && <Confirm title="Batalkan pengajuan?" description="Pengajuan akan ditandai Dibatalkan dan tetap tersimpan dalam riwayat." busy={submitting} onCancel={() => setConfirmCancel(false)} onConfirm={() => void cancel()} confirmLabel="Ya, Batalkan" danger/>}
  </div>;
}

function QuickAction({ label, icon: Icon, onClick }: { label: string; icon: typeof CalendarDays; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"><span className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={19}/></span>{label}</button>; }
function StatusBadge({ status }: { status: LeaveStatus }) { return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusStyles[status]}`}>{statusLabels[status]}</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-bold text-slate-700"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-sm leading-6 text-slate-800">{value}</p></div>; }
function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 p-2 sm:items-center sm:justify-center" role="presentation"><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-[26px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">{title}</h2><button type="button" onClick={onClose} aria-label="Tutup" className="grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-600"><X size={20}/></button></div>{children}</section></div>; }
function Confirm({ title, description, busy, onCancel, onConfirm, confirmLabel, danger = false }: { title: string; description: string; busy: boolean; onCancel: () => void; onConfirm: () => void; confirmLabel: string; danger?: boolean }) { return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl"><span className={`grid size-12 place-items-center rounded-2xl ${danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>{danger ? <X/> : <Check/>}</span><h2 className="mt-4 text-lg font-black text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 font-bold text-slate-700">Kembali</button><button type="button" disabled={busy} onClick={onConfirm} className={`min-h-11 rounded-xl font-bold text-white ${danger ? "bg-red-600" : "bg-blue-600"}`}>{busy ? "Memproses…" : confirmLabel}</button></div></section></div>; }

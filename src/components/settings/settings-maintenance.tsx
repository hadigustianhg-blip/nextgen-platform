"use client";

import { useState } from "react";
import { Database, Eye, ShieldAlert, ShieldCheck, Trash2, X } from "lucide-react";
import { buttonClass, inputClass, SettingsCard } from "./settings-shell";

export type MaintenanceCandidate = {
  key: string;
  label: string;
  count: number;
  oldest: string | null;
  newest: string | null;
  status: "RESETTABLE" | "BLOCKED" | "EMPTY";
  safe: boolean;
  blocker: string | null;
  risk: string[];
  relationsAffected: string[];
  previewToken: string;
};

export type MaintenanceData = {
  retentionDays?: number;
  generatedAt?: string;
  candidates?: MaintenanceCandidate[];
};

type ApiResponse = { data?: { deletedCount?: number }; error?: { code?: string } };

async function resetApi(candidate: MaintenanceCandidate, reason: string, confirmation: string) {
  const response = await fetch("/api/settings/maintenance/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateKey: candidate.key, reason, confirmation, previewToken: candidate.previewToken }),
  });
  const text = await response.text();
  let body: ApiResponse | null = null;
  try { body = text ? JSON.parse(text) as ApiResponse : null; } catch { body = null; }
  if (!response.ok || !body) throw new Error(body?.error?.code ?? "SETTINGS_REQUEST_FAILED");
  return body;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

function CandidateStatus({ candidate }: { candidate: MaintenanceCandidate }) {
  if (candidate.status === "RESETTABLE") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><ShieldCheck size={14}/> Dapat Direset</span>;
  if (candidate.status === "BLOCKED") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"><ShieldAlert size={14}/> Terblokir</span>;
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Tidak ada data</span>;
}

export function SettingsMaintenance({ data, reload }: { data: MaintenanceData; reload: () => Promise<void> }) {
  const [detail, setDetail] = useState<MaintenanceCandidate | null>(null);
  const [reset, setReset] = useState<MaintenanceCandidate | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function openReset(candidate: MaintenanceCandidate) {
    setReset(candidate); setReason(""); setConfirmation(""); setError(""); setMessage("");
  }

  async function submitReset() {
    if (!reset) return;
    setSaving(true); setError("");
    try {
      const result = await resetApi(reset, reason, confirmation);
      setMessage(`${Number(result.data?.deletedCount ?? 0)} record ${reset.label} berhasil direset.`);
      setReset(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reset data gagal.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-5">
    <SettingsCard title="Maintenance Data Terarah">
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
        <Database className="mt-0.5 shrink-0" size={18}/>
        <p>Reset hanya tersedia untuk data terminal yang telah lolos pemeriksaan relasi. Data source operasional aktif, Audit Log, dan kategori lain tidak disentuh.</p>
      </div>
      {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {error && !reset && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </SettingsCard>

    <div className="grid gap-4 xl:grid-cols-2">
      {(data.candidates ?? []).map((candidate) => <article key={candidate.key} className="flex min-h-72 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="font-bold text-slate-950">{candidate.label}</h3><p className="mt-1 text-3xl font-extrabold text-slate-950">{candidate.count}<span className="ml-1 text-sm font-medium text-slate-500">record</span></p></div>
          <CandidateStatus candidate={candidate}/>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rentang tanggal</dt><dd className="mt-1 text-slate-700">{formatDate(candidate.oldest)} – {formatDate(candidate.newest)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Relasi terdampak</dt><dd className="mt-1 text-slate-700">{candidate.relationsAffected.length ? candidate.relationsAffected.join(", ") : "Tidak ada relasi yang aman dihapus"}</dd></div>
        </dl>
        <div className={`mt-4 rounded-xl p-3 text-sm ${candidate.blocker ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
          <b>{candidate.blocker ? "Blocker: " : "Risiko: "}</b>{candidate.blocker ?? candidate.risk[0]}
        </div>
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
          <button className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => setDetail(candidate)}><Eye size={16}/> Lihat Detail</button>
          <button className={buttonClass} disabled={!candidate.safe || candidate.count === 0} title={candidate.blocker ?? (candidate.count === 0 ? "Tidak ada data" : "Reset data")} onClick={() => openReset(candidate)}><Trash2 size={16}/> {candidate.count === 0 ? "Tidak ada data" : "Reset Data"}</button>
        </div>
      </article>)}
    </div>

    {detail && <Modal title={`Detail — ${detail.label}`} onClose={() => setDetail(null)}>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Info label="Jumlah kandidat" value={`${detail.count} record`}/>
        <Info label="Rentang tanggal" value={`${formatDate(detail.oldest)} – ${formatDate(detail.newest)}`}/>
        <Info label="Status keamanan" value={detail.status === "RESETTABLE" ? "Dapat Direset" : detail.status === "BLOCKED" ? "Terblokir" : "Tidak ada data"}/>
        <Info label="Relasi terdampak" value={detail.relationsAffected.join(", ") || "—"}/>
      </dl>
      <section className="mt-5"><h4 className="text-sm font-bold text-slate-800">Risiko dan pengaman</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{detail.risk.map((item) => <li key={item}>{item}</li>)}</ul></section>
      {detail.blocker && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><b>Alasan blocker:</b> {detail.blocker}</p>}
      <div className="mt-5 flex justify-end"><button className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => setDetail(null)}>Tutup</button></div>
    </Modal>}

    {reset && <Modal title={`Reset ${reset.label}`} onClose={() => !saving && setReset(null)}>
      <p className="text-sm text-slate-700">Data yang akan dihapus: <b>{reset.count} record {reset.label}</b></p>
      <p className="mt-1 text-sm text-slate-600">Rentang: {formatDate(reset.oldest)} – {formatDate(reset.newest)}</p>
      <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><b>Risiko:</b><ul className="mt-2 list-disc space-y-1 pl-5">{reset.risk.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <label className="mt-4 block text-sm font-semibold text-slate-700">Alasan reset<textarea className={`${inputClass} mt-1 min-h-24`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan alasan operasional reset data"/></label>
      <label className="mt-4 block text-sm font-semibold text-slate-700">Ketik RESET untuk konfirmasi<input className={`${inputClass} mt-1`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off"/></label>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className={`${buttonClass} bg-slate-100 text-slate-700`} disabled={saving} onClick={() => setReset(null)}>Batal</button><button className={buttonClass} disabled={saving || reason.trim().length < 10 || confirmation !== "RESET"} onClick={() => void submitReset()}>{saving ? "Mereset..." : "Reset Data"}</button></div>
    </Modal>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-700">{value}</dd></div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true"><section className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-950">{title}</h3><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Tutup"><X size={18}/></button></div>{children}</section></div>; }

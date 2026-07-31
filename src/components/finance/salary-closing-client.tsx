"use client";

import { useEffect, useState } from "react";
import { Eye, LoaderCircle, Plus, X } from "lucide-react";
import {
  AppCard,
  ModalCard,
  PageHeader,
  SectionCard,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type Closing = {
  id: string;
  closingNumber: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  notes: string | null;
  createdAt: string;
  createdBy: { name: string };
  _count?: { employees: number };
};

export function SalaryClosingClient({ canManage }: { canManage: boolean }) {
  const today = jakartaOperationalDate();
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [notes, setNotes] = useState("");
  const [closings, setClosings] = useState<Closing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Closing | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadClosings() {
    setLoading(true);
    try {
      const response = await fetch("/api/finance/salary/closings", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setClosings((await response.json()).data);
    } catch {
      setError("Salary closing gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadClosings());
  }, []);

  async function createDraft() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/salary/closings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodStart,
          periodEnd,
          notes: notes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Draft salary closing gagal dibuat.",
      );
      setNotice(`Draft ${result.data.closingNumber} berhasil dibuat.`);
      setNotes("");
      await loadClosings();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Draft salary closing gagal dibuat.");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    const response = await fetch(`/api/finance/salary/closings/${id}`, {
      cache: "no-store",
    });
    if (response.ok) setSelected((await response.json()).data);
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Salary Closing"
      description="Buat dan tinjau fondasi periode salary tanpa calculation engine."/>
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {canManage && <SectionCard title="Buat Draft Closing">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm font-semibold text-slate-700">Tanggal Awal
          <input type="date" value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            className={`${nextgenControlClass} mt-1`}/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Tanggal Akhir
          <input type="date" value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className={`${nextgenControlClass} mt-1`}/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Catatan
          <input value={notes} onChange={(event) => setNotes(event.target.value)}
            className={`${nextgenControlClass} mt-1`}/>
        </label>
        <button type="button" disabled={saving}
          onClick={() => void createDraft()} className={`${nextgenButtonClass} self-end`}>
          {saving ? <LoaderCircle className="animate-spin" size={17}/> : <Plus size={17}/>}
          {saving ? "Membuat..." : "Buat Draft Closing"}
        </button>
      </div>
    </SectionCard>}
    <SectionCard title="Daftar Salary Closing">
      <TableCard><div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nomor Closing", "Periode", "Status", "Dibuat Oleh", "Tanggal Dibuat", "Aksi"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{closings.map((closing) => <tr key={closing.id}>
            <td className="px-3 py-3 font-semibold">{closing.closingNumber}</td>
            <td className="px-3 py-3">{closing.periodStart.slice(0, 10)} — {closing.periodEnd.slice(0, 10)}</td>
            <td className="px-3 py-3">{closing.status}</td>
            <td className="px-3 py-3">{closing.createdBy.name}</td>
            <td className="px-3 py-3">{closing.createdAt.slice(0, 10)}</td>
            <td className="px-3 py-3"><button type="button"
              onClick={() => void openDetail(closing.id)}
              className={nextgenNeutralButtonClass}><Eye size={16}/>Detail</button></td>
          </tr>)}</tbody>
        </table>
        {!loading && !closings.length && <p className="p-8 text-center text-sm text-slate-500">Belum ada draft salary closing.</p>}
      </div></TableCard>
    </SectionCard>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-xl">
        <div className="flex items-center justify-between border-b p-5">
          <div><p className="text-sm text-slate-500">Detail Salary Closing</p>
            <h2 className="text-xl font-bold">{selected.closingNumber}</h2></div>
          <button type="button" onClick={() => setSelected(null)}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          <AppCard className="p-4 text-sm">
            <p>Periode: {selected.periodStart.slice(0, 10)} — {selected.periodEnd.slice(0, 10)}</p>
            <p>Status: {selected.status}</p>
            <p>Catatan: {selected.notes || "—"}</p>
          </AppCard>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Perhitungan salary akan tersedia pada tahap Generate Closing.
          </div>
        </div>
      </ModalCard>
    </div>}
  </div>;
}

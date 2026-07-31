"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, LoaderCircle, Plus } from "lucide-react";
import {
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
  employees: Array<{
    systemIncomeTotal: string;
    manualAdditionTotal: string;
    manualDeductionTotal: string;
    netSalary: string;
  }>;
};

const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  CLOSED: "Dalam Review",
  PROCESSED: "Masuk Rekap",
  PAID: "Dibayar",
  VOID: "Dibatalkan",
};
const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export function SalaryClosingClient({ canManage }: { canManage: boolean }) {
  const today = jakartaOperationalDate();
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [notes, setNotes] = useState("");
  const [closings, setClosings] = useState<Closing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Salary Closing"
      description="Hitung, review, dan finalisasi penghasilan team berdasarkan periode."/>
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
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nomor Closing", "Periode", "Status", "Jumlah Team", "Penghasilan Sistem", "Tambahan", "Potongan", "Total Bersih", "Dibuat Oleh", "Tanggal Dibuat", "Aksi"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{closings.map((closing) => {
            const totals = closing.employees.reduce((result, employee) => ({
              system: result.system + Number(employee.systemIncomeTotal),
              addition: result.addition + Number(employee.manualAdditionTotal),
              deduction: result.deduction + Number(employee.manualDeductionTotal),
              net: result.net + Number(employee.netSalary),
            }), { system: 0, addition: 0, deduction: 0, net: 0 });
            return <tr key={closing.id}>
            <td className="px-3 py-3 font-semibold">{closing.closingNumber}</td>
            <td className="px-3 py-3">{closing.periodStart.slice(0, 10)} — {closing.periodEnd.slice(0, 10)}</td>
            <td className="px-3 py-3">{statusLabel[closing.status] ?? closing.status}</td>
            <td className="px-3 py-3">{closing.employees.length}</td>
            <td className="px-3 py-3">{rupiah(totals.system)}</td>
            <td className="px-3 py-3">{rupiah(totals.addition)}</td>
            <td className="px-3 py-3">{rupiah(totals.deduction)}</td>
            <td className="px-3 py-3 font-semibold">{rupiah(totals.net)}</td>
            <td className="px-3 py-3">{closing.createdBy.name}</td>
            <td className="px-3 py-3">{closing.createdAt.slice(0, 10)}</td>
            <td className="px-3 py-3"><Link
              href={`/dashboard/finance/salary-closing/${closing.id}`}
              className={nextgenNeutralButtonClass}><Eye size={16}/>Detail</Link></td>
          </tr>;
          })}</tbody>
        </table>
        {!loading && !closings.length && <p className="p-8 text-center text-sm text-slate-500">Belum ada draft salary closing.</p>}
      </div></TableCard>
    </SectionCard>
  </div>;
}

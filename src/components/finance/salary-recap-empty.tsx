"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, LoaderCircle, Undo2, X } from "lucide-react";
import {
  AppCard,
  ModalCard,
  PageHeader,
  SectionCard,
  TableCard,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";

type Recap = {
  id: string;
  closingNumber: string;
  periodStart: string;
  periodEnd: string;
  status: "PROCESSED" | "PAID";
  processedAt: string | null;
  canCancelRecap: boolean;
  cancelBlockReason: string | null;
  employees: Array<{
    systemIncomeTotal: string;
    manualAdditionTotal: string;
    manualDeductionTotal: string;
    netSalary: string;
  }>;
};
const recapTotal = (recap: Recap) => recap.employees.reduce(
  (sum, employee) => ({
    system: sum.system + Number(employee.systemIncomeTotal),
    addition: sum.addition + Number(employee.manualAdditionTotal),
    deduction: sum.deduction + Number(employee.manualDeductionTotal),
    net: sum.net + Number(employee.netSalary),
  }),
  { system: 0, addition: 0, deduction: 0, net: 0 },
);
const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export function SalaryRecapEmpty() {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<Recap | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelledClosing, setCancelledClosing] = useState<{
    id: string;
    closingNumber: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadRecaps() {
    setLoading(true);
    try {
      const response = await fetch("/api/finance/salary/recaps", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setRecaps((await response.json()).data);
    } catch {
      setError("Salary Recap gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadRecaps());
  }, []);

  async function cancelRecap() {
    if (!cancelTarget || cancelLoading) return;
    if (cancelReason.trim().length < 5) {
      setError("Alasan pembatalan minimal 5 karakter.");
      return;
    }
    setCancelLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/salary/recaps/${cancelTarget.id}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: cancelReason }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Salary Recap gagal dibatalkan.",
      );
      const cancelled = {
        id: cancelTarget.id,
        closingNumber: cancelTarget.closingNumber,
      };
      setCancelTarget(null);
      setCancelReason("");
      setCancelledClosing(cancelled);
      setNotice("Salary Recap berhasil dibatalkan dan dikembalikan ke Dalam Review.");
      await loadRecaps();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Salary Recap gagal dibatalkan.");
    } finally {
      setCancelLoading(false);
    }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Salary Recap"
      description="Rekap salary final yang telah diproses dan dikunci."/>
    {notice && <div role="status"
      className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      {notice}{cancelledClosing && <Link
        href={`/dashboard/finance/salary-closing/${cancelledClosing.id}`}
        className="ml-2 font-bold underline">Buka Salary Closing</Link>}
    </div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <SectionCard title="Daftar Salary">
      <TableCard><div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nomor Closing", "Periode", "Jumlah Team", "Penghasilan Sistem", "Tambahan", "Potongan", "Total Bersih", "Status", "Tanggal Diproses", "Aksi"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{recaps.map((recap) => {
            const total = recapTotal(recap);
            return <tr key={recap.id}>
              <td className="px-3 py-3 font-semibold">{recap.closingNumber}</td>
              <td className="px-3 py-3">{recap.periodStart.slice(0, 10)} — {recap.periodEnd.slice(0, 10)}</td>
              <td className="px-3 py-3">{recap.employees.length}</td>
              <td className="px-3 py-3">{rupiah(total.system)}</td>
              <td className="px-3 py-3">{rupiah(total.addition)}</td>
              <td className="px-3 py-3">{rupiah(total.deduction)}</td>
              <td className="px-3 py-3 font-semibold">{rupiah(total.net)}</td>
              <td className="px-3 py-3">{recap.status === "PAID" ? "Dibayar" : "Masuk Rekap"}</td>
              <td className="px-3 py-3">{recap.processedAt?.slice(0, 10) || "—"}</td>
              <td className="px-3 py-3"><div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/finance/salary-recap/${recap.id}`}
                  className={nextgenNeutralButtonClass}><Eye size={16}/>Detail</Link>
                {recap.canCancelRecap && <button type="button"
                  disabled={cancelLoading}
                  onClick={() => {
                    setCancelTarget(recap);
                    setCancelReason("");
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                  <Undo2 size={16}/>Batalkan Rekap
                </button>}
                {recap.cancelBlockReason && <span className="max-w-64 text-xs text-rose-700">
                  {recap.cancelBlockReason}
                </span>}
              </div></td>
            </tr>;
          })}</tbody>
        </table>
        {loading && <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin"/></div>}
        {!loading && !recaps.length && <p className="p-8 text-center text-sm text-slate-500">
          Salary yang sudah diproses akan tampil di sini.
        </p>}
      </div></TableCard>
    </SectionCard>
    {cancelTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <p className="text-sm font-semibold text-rose-700">Konfirmasi Pembatalan</p>
            <h2 className="text-xl font-bold">Batalkan Rekap</h2>
          </div>
          <button type="button" disabled={cancelLoading}
            aria-label="Tutup modal Batalkan Rekap"
            onClick={() => setCancelTarget(null)}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          <AppCard className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <p>Nomor Closing<br/><strong>{cancelTarget.closingNumber}</strong></p>
            <p>Periode<br/><strong>{cancelTarget.periodStart.slice(0, 10)} — {cancelTarget.periodEnd.slice(0, 10)}</strong></p>
            <p>Jumlah Team<br/><strong>{cancelTarget.employees.length}</strong></p>
            <p>Total Bersih<br/><strong>{rupiah(recapTotal(cancelTarget).net)}</strong></p>
          </AppCard>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Data akan dikembalikan ke tahap review dan seluruh team wajib menyimpan Adjustment kembali.
          </p>
          <label className="block text-sm font-semibold">Alasan Pembatalan
            <textarea value={cancelReason} disabled={cancelLoading}
              onChange={(event) => setCancelReason(event.target.value)}
              className={`${nextgenControlClass} mt-1 h-24 w-full`}/>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" disabled={cancelLoading}
            onClick={() => setCancelTarget(null)}
            className={nextgenNeutralButtonClass}>Kembali</button>
          <button type="button" disabled={cancelLoading}
            onClick={() => void cancelRecap()}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            {cancelLoading && <LoaderCircle className="animate-spin" size={16}/>}
            {cancelLoading ? "Membatalkan..." : "Batalkan Rekap"}
          </button>
        </div>
      </ModalCard>
    </div>}
  </div>;
}

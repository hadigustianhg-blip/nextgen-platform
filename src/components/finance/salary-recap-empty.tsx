"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, LoaderCircle } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  TableCard,
  nextgenNeutralButtonClass,
} from "@/components/ui";

type Recap = {
  id: string;
  closingNumber: string;
  periodStart: string;
  periodEnd: string;
  status: "PROCESSED" | "PAID";
  processedAt: string | null;
  employees: Array<{
    systemIncomeTotal: string;
    manualAdditionTotal: string;
    manualDeductionTotal: string;
    netSalary: string;
  }>;
};
const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export function SalaryRecapEmpty() {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(async () => {
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
    });
  }, []);

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Salary Recap"
      description="Rekap salary final yang telah diproses dan dikunci."/>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <SectionCard title="Daftar Salary">
      <TableCard><div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nomor Closing", "Periode", "Jumlah Team", "Penghasilan Sistem", "Tambahan", "Potongan", "Total Bersih", "Status", "Tanggal Diproses", "Aksi"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{recaps.map((recap) => {
            const total = recap.employees.reduce((sum, employee) => ({
              system: sum.system + Number(employee.systemIncomeTotal),
              addition: sum.addition + Number(employee.manualAdditionTotal),
              deduction: sum.deduction + Number(employee.manualDeductionTotal),
              net: sum.net + Number(employee.netSalary),
            }), { system: 0, addition: 0, deduction: 0, net: 0 });
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
              <td className="px-3 py-3"><Link
                href={`/dashboard/finance/salary-recap/${recap.id}`}
                className={nextgenNeutralButtonClass}><Eye size={16}/>Detail</Link></td>
            </tr>;
          })}</tbody>
        </table>
        {loading && <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin"/></div>}
        {!loading && !recaps.length && <p className="p-8 text-center text-sm text-slate-500">
          Salary yang sudah diproses akan tampil di sini.
        </p>}
      </div></TableCard>
    </SectionCard>
  </div>;
}

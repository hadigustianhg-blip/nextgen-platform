import { PageHeader, SectionCard } from "@/components/ui";

export function SalaryRecapEmpty() {
  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Salary Recap"
      description="Rekap salary yang telah selesai diproses."/>
    <SectionCard title="Daftar Salary">
      <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <div>
          <p className="font-semibold text-slate-900">
            Salary yang sudah diproses akan tampil di sini.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Process Salary belum tersedia pada Sprint 1.
          </p>
        </div>
      </div>
    </SectionCard>
  </div>;
}

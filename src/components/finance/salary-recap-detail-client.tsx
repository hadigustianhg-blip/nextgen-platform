"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, LoaderCircle, Megaphone, Undo2, X } from "lucide-react";
import {
  AppCard,
  MetricCard,
  ModalCard,
  PageHeader,
  SectionCard,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";

type RecapEmployee = {
  id: string;
  employeeNameSnapshot: string;
  divisionSnapshot: string;
  workDayCount: number;
  sourcePickupCount: number;
  sourceDispatchCount: number;
  systemIncomeTotal: string;
  manualAdditionTotal: string;
  manualDeductionTotal: string;
  netSalary: string;
};

type Recap = {
  id: string;
  closingNumber: string;
  periodStart: string;
  periodEnd: string;
  status: "PROCESSED" | "PAID";
  processedAt: string | null;
  canCancelRecap: boolean;
  cancelBlockReason: string | null;
  employees: RecapEmployee[];
};

type PublicationLine = {
  id: string;
  componentName?: string;
  category?: string;
  reason?: string;
  amount: string;
  quantity?: string | null;
  rate?: string | null;
};

type Publication = {
  closing: {
    id: string;
    closingNumber: string;
    periodStart: string;
    periodEnd: string;
    status: "PROCESSED" | "PAID";
    processedAt: string | null;
  };
  identity: {
    brandName: string;
    outletName: string | null;
    outletCode: string;
  };
  employee: {
    id: string;
    name: string;
    division: string;
    workDayCount: number;
    pickupCount: number;
    dispatchCount: number;
  };
  components: PublicationLine[];
  additions: PublicationLine[];
  deductions: PublicationLine[];
  kasbonAllocations: Array<PublicationLine & {
    kasbonSnapshot: {
      operationalDate: string;
      description: string | null;
    } | null;
  }>;
  totals: {
    systemIncome: string;
    addition: string;
    manualDeduction: string;
    kasbon: string;
    totalIncome: string;
    totalDeduction: string;
    netSalary: string;
  };
  publicationStatus: "READY";
};

const divisionLabel: Record<string, string> = {
  ADMIN: "Admin",
  ADMIN_OPS: "Admin Ops",
  SALES: "Sales",
  THREE_WHEEL_DRIVER: "Driver Roda Tiga",
  MOTORIST: "Motoris",
  DRIVER: "Driver",
};
const rupiah = (value: string | number) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number(value));
const formatPeriod = (start: string, end: string) =>
  `${start.slice(0, 10)} — ${end.slice(0, 10)}`;

export function SalaryRecapDetailClient({ closingId }: { closingId: string }) {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publication, setPublication] = useState<Publication | null>(null);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [publicationLoading, setPublicationLoading] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const [showRecap, setShowRecap] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const response = await fetch(`/api/finance/salary/recaps/${closingId}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(
          result.error?.message || "Detail Salary Recap gagal dimuat.",
        );
        setRecap(result.data);
      } catch (cause) {
        setError(cause instanceof Error
          ? cause.message
          : "Detail Salary Recap gagal dimuat.");
      } finally {
        setLoading(false);
      }
    });
  }, [closingId]);

  async function openPublication(employeeId: string) {
    if (publicationLoading) return;
    setPublication(null);
    setPublicationError("");
    setShowRecap(false);
    setPublicationOpen(true);
    setPublicationLoading(true);
    try {
      const response = await fetch(
        `/api/finance/salary/recaps/${closingId}/employees/${employeeId}/publication`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Salary Card gagal dimuat.",
      );
      setPublication(result.data);
    } catch (cause) {
      setPublicationError(cause instanceof Error
        ? cause.message
        : "Salary Card gagal dimuat.");
    } finally {
      setPublicationLoading(false);
    }
  }

  async function cancelRecap() {
    if (cancelLoading || cancelReason.trim().length < 5) {
      if (cancelReason.trim().length < 5) {
        setError("Alasan pembatalan minimal 5 karakter.");
      }
      return;
    }
    setCancelLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/salary/recaps/${closingId}/cancel`,
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
      setCancelOpen(false);
      setCancelled(true);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Salary Recap gagal dibatalkan.");
    } finally {
      setCancelLoading(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-64 place-items-center">
      <LoaderCircle className="animate-spin text-blue-600"/>
    </div>;
  }
  if (cancelled) {
    return <div className="space-y-4">
      <div role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        Salary Recap berhasil dibatalkan dan dikembalikan ke Dalam Review.
      </div>
      <Link href={`/dashboard/finance/salary-closing/${closingId}`}
        className={nextgenButtonClass}>Buka Salary Closing</Link>
    </div>;
  }
  if (!recap) return <p>{error || "Salary Recap tidak ditemukan."}</p>;

  const totals = recap.employees.reduce((sum, employee) => ({
    system: sum.system + Number(employee.systemIncomeTotal),
    addition: sum.addition + Number(employee.manualAdditionTotal),
    deduction: sum.deduction + Number(employee.manualDeductionTotal),
    net: sum.net + Number(employee.netSalary),
  }), { system: 0, addition: 0, deduction: 0, net: 0 });

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title={recap.closingNumber}
      description={formatPeriod(recap.periodStart, recap.periodEnd)}
      actions={<>
        <Link href="/dashboard/finance/salary-recap"
          className={nextgenNeutralButtonClass}>Kembali</Link>
        {recap.canCancelRecap && <button type="button"
          disabled={cancelLoading}
          onClick={() => {
            setCancelReason("");
            setCancelOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
          <Undo2 size={16}/>Batalkan Rekap
        </button>}
      </>}/>
    {error && <div role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {error}
    </div>}
    {recap.cancelBlockReason && <div
      className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {recap.cancelBlockReason}
    </div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Jumlah Team" value={recap.employees.length}/>
      <MetricCard label="Penghasilan Sistem" value={rupiah(totals.system)}/>
      <MetricCard label="Total Potongan" value={rupiah(totals.deduction)}/>
      <MetricCard label="Total Bersih" value={rupiah(totals.net)}/>
    </div>
    <SectionCard title="Team Salary">
      <TableCard><div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nama", "Divisi", "Hari Kerja", "Pickup", "Dispatch",
              "Penghasilan Sistem", "Tambahan", "Potongan", "Total Bersih",
              "Status", "Aksi"].map((label) =>
              <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{recap.employees.map((employee) =>
            <tr key={employee.id}>
              <td className="px-3 py-3 font-semibold">{employee.employeeNameSnapshot}</td>
              <td className="px-3 py-3">{divisionLabel[employee.divisionSnapshot] ?? employee.divisionSnapshot}</td>
              <td className="px-3 py-3">{employee.workDayCount}</td>
              <td className="px-3 py-3">{employee.sourcePickupCount}</td>
              <td className="px-3 py-3">{employee.sourceDispatchCount}</td>
              <td className="px-3 py-3">{rupiah(employee.systemIncomeTotal)}</td>
              <td className="px-3 py-3">{rupiah(employee.manualAdditionTotal)}</td>
              <td className="px-3 py-3">{rupiah(employee.manualDeductionTotal)}</td>
              <td className="px-3 py-3 font-bold">{rupiah(employee.netSalary)}</td>
              <td className="px-3 py-3 font-semibold text-emerald-700">
                Siap Dipublikasikan
              </td>
              <td className="px-3 py-3"><button type="button"
                disabled={publicationLoading}
                onClick={() => void openPublication(employee.id)}
                className={nextgenButtonClass}>
                <Megaphone size={16}/>Publikasikan
              </button></td>
            </tr>)}</tbody>
        </table>
      </div></TableCard>
    </SectionCard>

    {publicationOpen && <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-3">
      <ModalCard className="flex max-h-[94vh] max-w-6xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b p-5">
          <div>
            <p className="text-sm text-slate-500">Publikasi Salary per Team</p>
            <h2 className="text-xl font-bold">
              Publikasi Salary — {publication?.employee.name ?? "Memuat..."}
            </h2>
          </div>
          <button type="button" disabled={publicationLoading}
            aria-label="Tutup Publikasi Salary"
            onClick={() => setPublicationOpen(false)}><X/></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {publicationLoading && <div className="grid min-h-72 place-items-center">
            <LoaderCircle className="animate-spin text-blue-600"/>
          </div>}
          {publicationError && <div role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            {publicationError}
          </div>}
          {publication && <div className="space-y-6">
            <AppCard className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p>Nama<br/><strong>{publication.employee.name}</strong></p>
              <p>Divisi<br/><strong>{divisionLabel[publication.employee.division] ?? publication.employee.division}</strong></p>
              <p>Periode Salary<br/><strong>{formatPeriod(publication.closing.periodStart, publication.closing.periodEnd)}</strong></p>
              <p>Nomor Closing<br/><strong>{publication.closing.closingNumber}</strong></p>
              <p>Brand<br/><strong>{publication.identity.brandName}</strong></p>
              <p>Kode Outlet<br/><strong>{publication.identity.outletCode}</strong></p>
              <p>Hari Kerja<br/><strong>{publication.employee.workDayCount}</strong></p>
              <p>Pickup / Dispatch<br/><strong>{publication.employee.pickupCount} / {publication.employee.dispatchCount}</strong></p>
            </AppCard>

            {showRecap && <SectionCard title="Rekapan Salary Final">
              <div className="grid gap-4 lg:grid-cols-3">
                <AppCard className="space-y-2 p-4 text-sm">
                  <h3 className="font-bold">Penghasilan</h3>
                  <p className="flex justify-between"><span>Penghasilan Sistem</span><strong>{rupiah(publication.totals.systemIncome)}</strong></p>
                  {publication.components.map((line) => <p key={line.id}
                    className="flex justify-between gap-3 text-slate-600">
                    <span>{line.componentName}</span><span>{rupiah(line.amount)}</span>
                  </p>)}
                  <p className="flex justify-between"><span>Tambahan</span><strong>{rupiah(publication.totals.addition)}</strong></p>
                  {publication.additions.map((line) => <p key={line.id}
                    className="flex justify-between gap-3 text-slate-600">
                    <span>{line.category} · {line.reason}</span><span>{rupiah(line.amount)}</span>
                  </p>)}
                </AppCard>
                <AppCard className="space-y-2 p-4 text-sm">
                  <h3 className="font-bold">Potongan</h3>
                  <p className="flex justify-between"><span>Potongan Manual</span><strong>{rupiah(publication.totals.manualDeduction)}</strong></p>
                  {publication.deductions.map((line) => <p key={line.id}
                    className="flex justify-between gap-3 text-slate-600">
                    <span>{line.category} · {line.reason}</span><span>{rupiah(line.amount)}</span>
                  </p>)}
                  <p className="flex justify-between"><span>Potongan Kasbon</span><strong>{rupiah(publication.totals.kasbon)}</strong></p>
                  {publication.kasbonAllocations.map((line) => <p key={line.id}
                    className="flex justify-between gap-3 text-slate-600">
                    <span>{line.kasbonSnapshot?.description || "Kasbon"}</span><span>{rupiah(line.amount)}</span>
                  </p>)}
                </AppCard>
                <AppCard className="space-y-3 p-4 text-sm">
                  <p className="flex justify-between"><span>Total Penghasilan</span><strong>{rupiah(publication.totals.totalIncome)}</strong></p>
                  <p className="flex justify-between"><span>Total Potongan</span><strong>{rupiah(publication.totals.totalDeduction)}</strong></p>
                  <p className="flex justify-between border-t pt-3 text-base"><span>Total Bersih</span><strong>{rupiah(publication.totals.netSalary)}</strong></p>
                </AppCard>
              </div>
            </SectionCard>}

            <section aria-label="Preview Salary Card"
              className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
              <header className="bg-slate-950 px-5 py-6 text-white sm:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold sm:text-2xl">{publication.identity.brandName}</p>
                    <p className="mt-1 text-sm text-slate-300">
                      {publication.identity.outletName
                        ? `${publication.identity.outletName} · ${publication.identity.outletCode}`
                        : publication.identity.outletCode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tracking-[0.24em] text-sky-300">SLIP GAJI</p>
                    <p className="mt-1 text-sm">{formatPeriod(publication.closing.periodStart, publication.closing.periodEnd)}</p>
                  </div>
                </div>
              </header>
              <div className="space-y-6 p-5 sm:p-8">
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <p>Nama<br/><strong className="text-base">{publication.employee.name}</strong></p>
                  <p>Divisi<br/><strong>{divisionLabel[publication.employee.division] ?? publication.employee.division}</strong></p>
                  <p>Nomor Closing<br/><strong>{publication.closing.closingNumber}</strong></p>
                  <p>Hari Kerja<br/><strong>{publication.employee.workDayCount}</strong></p>
                  <p>Pickup<br/><strong>{publication.employee.pickupCount}</strong></p>
                  <p>Dispatch<br/><strong>{publication.employee.dispatchCount}</strong></p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm">
                    <h3 className="font-bold text-emerald-900">Penghasilan</h3>
                    <p className="mt-3 flex justify-between"><span>Penghasilan Sistem</span><strong>{rupiah(publication.totals.systemIncome)}</strong></p>
                    {publication.components.map((line) => <p key={line.id}
                      className="mt-2 flex justify-between gap-3 text-xs text-emerald-900/75">
                      <span>{line.componentName}</span><span>{rupiah(line.amount)}</span>
                    </p>)}
                    <p className="mt-3 flex justify-between"><span>Tambahan</span><strong>{rupiah(publication.totals.addition)}</strong></p>
                    <p className="mt-3 flex justify-between border-t border-emerald-200 pt-3"><span>Total Penghasilan</span><strong>{rupiah(publication.totals.totalIncome)}</strong></p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-4 text-sm">
                    <h3 className="font-bold text-rose-900">Potongan</h3>
                    <p className="mt-3 flex justify-between"><span>Potongan Manual</span><strong>{rupiah(publication.totals.manualDeduction)}</strong></p>
                    <p className="mt-3 flex justify-between"><span>Potongan Kasbon</span><strong>{rupiah(publication.totals.kasbon)}</strong></p>
                    <p className="mt-3 flex justify-between border-t border-rose-200 pt-3"><span>Total Potongan</span><strong>{rupiah(publication.totals.totalDeduction)}</strong></p>
                  </div>
                </div>
                <div className="rounded-2xl bg-sky-600 p-5 text-center text-white">
                  <p className="text-xs font-bold tracking-[0.18em]">TOTAL BERSIH DITERIMA</p>
                  <p className="mt-2 break-words text-3xl font-black sm:text-4xl">
                    {rupiah(publication.totals.netSalary)}
                  </p>
                </div>
              </div>
              <footer className="flex flex-wrap justify-between gap-2 border-t bg-slate-50 px-5 py-3 text-[10px] text-slate-500 sm:px-8">
                <span>Diproses: {publication.closing.processedAt?.slice(0, 10) || "—"} · Siap Dipublikasikan</span>
                <span>Created by NEXTGEN System</span>
              </footer>
            </section>
          </div>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-white p-4">
          {publication && <button type="button"
            onClick={() => setShowRecap((current) => !current)}
            className={nextgenNeutralButtonClass}>
            <Eye size={16}/>{showRecap ? "Sembunyikan Rekap" : "Lihat Rekap"}
          </button>}
          <button type="button" disabled={publicationLoading}
            onClick={() => setPublicationOpen(false)}
            className={nextgenNeutralButtonClass}>Tutup</button>
        </div>
      </ModalCard>
    </div>}

    {cancelOpen && <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-xl">
        <div className="flex items-center justify-between border-b p-5">
          <div><p className="text-sm font-semibold text-rose-700">Konfirmasi Pembatalan</p>
            <h2 className="text-xl font-bold">Batalkan Rekap</h2></div>
          <button type="button" disabled={cancelLoading}
            onClick={() => setCancelOpen(false)}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          <AppCard className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <p>Nomor Closing<br/><strong>{recap.closingNumber}</strong></p>
            <p>Periode<br/><strong>{formatPeriod(recap.periodStart, recap.periodEnd)}</strong></p>
            <p>Jumlah Team<br/><strong>{recap.employees.length}</strong></p>
            <p>Total Bersih<br/><strong>{rupiah(totals.net)}</strong></p>
          </AppCard>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Data akan kembali ke tahap review dan seluruh team wajib menyimpan Adjustment kembali.
          </p>
          <label className="block text-sm font-semibold">Alasan Pembatalan
            <textarea value={cancelReason} disabled={cancelLoading}
              onChange={(event) => setCancelReason(event.target.value)}
              className={`${nextgenControlClass} mt-1 h-24 w-full`}/>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" disabled={cancelLoading}
            onClick={() => setCancelOpen(false)}
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

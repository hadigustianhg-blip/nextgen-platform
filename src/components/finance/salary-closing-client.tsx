"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import {
  MetricCard,
  ModalCard,
  PageHeader,
  SectionCard,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import {
  salaryPreviewMonthRange,
  shiftedSalaryPreviewMonthRange,
} from "@/modules/salary/salary.preview-date";

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

type PreviewRow = {
  employeeId: string;
  name: string;
  division: string;
  workDayCount: number;
  pickupCount: number;
  dispatchCount: number;
  systemIncomeTotal: string;
  manualAdditionTotal: string;
  manualDeductionTotal: string;
  kasbonDeductionTotal: string;
  estimatedNetTotal: string;
  profileStatus: "MAPPED" | "UNMAPPED";
  components: Array<{
    code: string;
    name: string;
    quantity: string;
    rate: string;
    amount: string;
  }>;
};

type Preview = {
  period: { startDate: string; endDate: string };
  summary: {
    teamCount: number;
    workDayCount: number;
    pickupCount: number;
    dispatchCount: number;
    systemIncomeTotal: string;
    manualAdditionTotal: string;
    manualDeductionTotal: string;
    kasbonDeductionTotal: string;
    estimatedNetTotal: string;
  };
  data: PreviewRow[];
};

const divisionLabel: Record<string, string> = {
  ADMIN: "Admin",
  ADMIN_OPS: "Admin Ops",
  SALES: "Sales",
  THREE_WHEEL_DRIVER: "Driver Roda Tiga",
  MOTORIST: "Motoris",
  DRIVER: "Driver",
};

const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  CLOSED: "Dalam Review",
  COMPLETED: "Closing Success",
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
  const router = useRouter();
  const today = jakartaOperationalDate();
  const currentMonth = salaryPreviewMonthRange(today);
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [notes, setNotes] = useState("");
  const [closings, setClosings] = useState<Closing[]>([]);
  const [closingStatusFilter, setClosingStatusFilter] = useState("ACTIVE");
  const [closingPage, setClosingPage] = useState(1);
  const [closingPagination, setClosingPagination] = useState({
    page: 1, pageSize: 25, total: 0, totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewStart, setPreviewStart] = useState(currentMonth.startDate);
  const [previewEnd, setPreviewEnd] = useState(currentMonth.endDate);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [previewDetail, setPreviewDetail] = useState<PreviewRow | null>(null);
  const [closingConfirmOpen, setClosingConfirmOpen] = useState(false);
  const [closingNotes, setClosingNotes] = useState("");
  const [closingRequestId, setClosingRequestId] = useState("");
  const [closingSaving, setClosingSaving] = useState(false);

  async function loadClosings() {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        statusFilter: closingStatusFilter,
        page: String(closingPage),
        pageSize: "25",
      });
      const response = await fetch(`/api/finance/salary/closings?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setClosings(result.data);
      setClosingPagination(result.pagination);
    } catch {
      setError("Salary closing gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadClosings());
  // The list filter and pagination do not affect Salary Preview state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closingStatusFilter, closingPage]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPreview() {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const query = new URLSearchParams({
          startDate: previewStart,
          endDate: previewEnd,
        });
        const response = await fetch(`/api/finance/salary/preview?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error?.message || "Preview Salary gagal dimuat.");
        }
        setPreview(result.data);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setPreviewError(cause instanceof Error
          ? cause.message
          : "Preview Salary gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }
    void loadPreview();
    return () => controller.abort();
  }, [previewStart, previewEnd]);

  function changePreviewMonth(offset: number) {
    const range = shiftedSalaryPreviewMonthRange(previewStart, offset);
    setPreviewStart(range.startDate);
    setPreviewEnd(range.endDate);
  }

  function openPreviewClosingConfirmation() {
    setClosingNotes("");
    setClosingRequestId(crypto.randomUUID());
    setClosingConfirmOpen(true);
    setError("");
  }

  async function createClosingFromPreview() {
    if (!preview || closingSaving || !closingRequestId) return;
    setClosingSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/salary/preview/closing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: previewStart,
          endDate: previewEnd,
          notes: closingNotes || null,
          requestId: closingRequestId,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const overlap = result.error?.details?.closingNumber;
        throw new Error(overlap
          ? `Periode bertabrakan dengan closing ${overlap}.`
          : result.error?.message || "Salary closing gagal dibuat.");
      }
      router.push(
        `/dashboard/finance/salary-closing/${result.data.id}?fromPreview=1`,
      );
    } catch (cause) {
      setClosingConfirmOpen(false);
      setError(cause instanceof Error
        ? cause.message
        : "Salary closing gagal dibuat.");
    } finally {
      setClosingSaving(false);
    }
  }

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
    <SectionCard title="Preview Salary Periode" badge={canManage
      ? <button type="button" disabled={previewLoading || !preview}
          onClick={openPreviewClosingConfirmation} className={nextgenButtonClass}>
          <Plus size={17}/>Buat Closing dari Periode Ini
        </button>
      : undefined}>
      <div className="grid gap-3 md:grid-cols-5">
        <button type="button" disabled={previewLoading}
          onClick={() => changePreviewMonth(-1)} className={nextgenNeutralButtonClass}>
          <ChevronLeft size={17}/>Bulan Sebelumnya
        </button>
        <button type="button" disabled={previewLoading}
          onClick={() => {
            setPreviewStart(currentMonth.startDate);
            setPreviewEnd(currentMonth.endDate);
          }} className={nextgenNeutralButtonClass}>Bulan Ini</button>
        <button type="button" disabled={previewLoading}
          onClick={() => changePreviewMonth(1)} className={nextgenNeutralButtonClass}>
          Bulan Berikutnya<ChevronRight size={17}/>
        </button>
        <label className="text-sm font-semibold text-slate-700">Tanggal Awal
          <input type="date" value={previewStart}
            onChange={(event) => setPreviewStart(event.target.value)}
            className={`${nextgenControlClass} mt-1`}/>
        </label>
        <label className="text-sm font-semibold text-slate-700">Tanggal Akhir
          <input type="date" value={previewEnd}
            onChange={(event) => setPreviewEnd(event.target.value)}
            className={`${nextgenControlClass} mt-1`}/>
        </label>
      </div>
      {previewError && <div role="alert"
        className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        {previewError}
      </div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Jumlah Team" value={previewLoading ? "…" : preview?.summary.teamCount ?? 0}/>
        <MetricCard label="Hari Kerja Total" value={previewLoading ? "…" : preview?.summary.workDayCount ?? 0}/>
        <MetricCard label="Pickup Terhitung" value={previewLoading ? "…" : preview?.summary.pickupCount ?? 0}/>
        <MetricCard label="Dispatch Terhitung" value={previewLoading ? "…" : preview?.summary.dispatchCount ?? 0}/>
        <MetricCard label="Penghasilan Sistem" value={previewLoading ? "…" : rupiah(Number(preview?.summary.systemIncomeTotal ?? 0))}/>
        <MetricCard label="Tambahan" value={previewLoading ? "…" : rupiah(Number(preview?.summary.manualAdditionTotal ?? 0))}/>
        <MetricCard label="Potongan Manual" value={previewLoading ? "…" : rupiah(Number(preview?.summary.manualDeductionTotal ?? 0))}/>
        <MetricCard label="Potongan Kasbon" value={previewLoading ? "…" : rupiah(Number(preview?.summary.kasbonDeductionTotal ?? 0))}/>
        <MetricCard label="Estimasi Total Bersih" value={previewLoading ? "…" : rupiah(Number(preview?.summary.estimatedNetTotal ?? 0))}/>
      </div>
      <TableCard className="mt-4"><div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nama", "Divisi", "Hari Kerja", "Pickup", "Dispatch", "Penghasilan Sistem", "Tambahan", "Potongan", "Kasbon", "Estimasi Total Bersih", "Status Profile", "Detail"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{preview?.data.map((row) => <tr key={row.employeeId}>
            <td className="px-3 py-3 font-semibold">{row.name}</td>
            <td className="px-3 py-3">{divisionLabel[row.division] ?? row.division}</td>
            <td className="px-3 py-3">{row.workDayCount}</td>
            <td className="px-3 py-3">{row.pickupCount}</td>
            <td className="px-3 py-3">{row.dispatchCount}</td>
            <td className="px-3 py-3">{rupiah(Number(row.systemIncomeTotal))}</td>
            <td className="px-3 py-3">{rupiah(Number(row.manualAdditionTotal))}</td>
            <td className="px-3 py-3">{rupiah(Number(row.manualDeductionTotal))}</td>
            <td className="px-3 py-3">{rupiah(Number(row.kasbonDeductionTotal))}</td>
            <td className="px-3 py-3 font-semibold">{rupiah(Number(row.estimatedNetTotal))}</td>
            <td className="px-3 py-3">{row.profileStatus === "MAPPED"
              ? "Terpetakan"
              : "Tidak terpetakan"}</td>
            <td className="px-3 py-3"><button type="button"
              onClick={() => setPreviewDetail(row)} className={nextgenNeutralButtonClass}>
              <Eye size={16}/>Detail
            </button></td>
          </tr>)}</tbody>
        </table>
        {!previewLoading && !preview?.data.length && <p
          className="p-8 text-center text-sm text-slate-500">
          Belum ada data Salary untuk periode ini.
        </p>}
      </div></TableCard>
    </SectionCard>
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-60 text-sm font-semibold text-slate-700">
          Filter Status
          <select value={closingStatusFilter}
            onChange={(event) => {
              setClosingStatusFilter(event.target.value);
              setClosingPage(1);
            }} className={`${nextgenControlClass} mt-1`}>
            <option value="ACTIVE">Closing Aktif</option>
            <option value="ALL">Semua Status</option>
            <option value="REVIEW">Dalam Review</option>
            <option value="SUCCESS">Closing Success</option>
            <option value="DRAFT">Draft</option>
            <option value="VOID">Dibatalkan / Void</option>
          </select>
        </label>
        <p className="text-sm text-slate-500">
          {closingPagination.total.toLocaleString("id-ID")} closing
        </p>
      </div>
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
            <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              closing.status === "COMPLETED"
                ? "bg-emerald-100 text-emerald-800"
                : closing.status === "VOID"
                  ? "bg-slate-200 text-slate-700"
                  : closing.status === "CLOSED"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-blue-100 text-blue-800"
            }`}>{statusLabel[closing.status] ?? closing.status}</span></td>
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
      <div className="mt-4 flex items-center justify-end gap-3">
        <button type="button" disabled={loading || closingPage <= 1}
          onClick={() => setClosingPage((page) => Math.max(1, page - 1))}
          className={nextgenNeutralButtonClass}>Sebelumnya</button>
        <span className="text-sm text-slate-600">
          Halaman {closingPagination.page} dari {closingPagination.totalPages}
        </span>
        <button type="button"
          disabled={loading || closingPage >= closingPagination.totalPages}
          onClick={() => setClosingPage((page) => page + 1)}
          className={nextgenNeutralButtonClass}>Berikutnya</button>
      </div>
    </SectionCard>
    {previewDetail && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-3xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <p className="text-sm font-semibold text-sky-700">Preview — belum dikunci</p>
            <h2 className="text-xl font-bold">{previewDetail.name}</h2>
          </div>
          <button type="button" aria-label="Tutup detail preview"
            onClick={() => setPreviewDetail(null)}><X/></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-5">
          <TableCard><div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
              {['Komponen', 'Kuantitas', 'Tarif', 'Nominal'].map((label) =>
                <th key={label} className="px-3 py-3">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y">{previewDetail.components.map((component) => <tr key={component.code}>
              <td className="px-3 py-3 font-semibold">{component.name}</td>
              <td className="px-3 py-3">{component.quantity}</td>
              <td className="px-3 py-3">{rupiah(Number(component.rate))}</td>
              <td className="px-3 py-3">{rupiah(Number(component.amount))}</td>
            </tr>)}</tbody>
          </table></div></TableCard>
          {!previewDetail.components.length && <p className="py-8 text-center text-sm text-slate-500">
            Belum ada komponen penghasilan yang terpetakan.
          </p>}
        </div>
        <div className="flex justify-end border-t p-4">
          <button type="button" onClick={() => setPreviewDetail(null)}
            className={nextgenNeutralButtonClass}>Tutup</button>
        </div>
      </ModalCard>
    </div>}
    {closingConfirmOpen && preview && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <p className="text-sm text-slate-500">Preview Salary Periode</p>
            <h2 className="text-xl font-bold">Buat Salary Closing</h2>
          </div>
          <button type="button" disabled={closingSaving}
            aria-label="Tutup konfirmasi closing"
            onClick={() => setClosingConfirmOpen(false)}><X/></button>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Tanggal awal", previewStart],
              ["Tanggal akhir", previewEnd],
              ["Jumlah team", String(preview.summary.teamCount)],
              ["Pickup terhitung", String(preview.summary.pickupCount)],
              ["Dispatch terhitung", String(preview.summary.dispatchCount)],
              ["Estimasi penghasilan sistem", rupiah(Number(preview.summary.systemIncomeTotal))],
            ].map(([label, value]) => <div key={label}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 font-bold text-slate-900">{value}</p>
            </div>)}
          </div>
          <label className="block text-sm font-semibold text-slate-700">Catatan opsional
            <textarea value={closingNotes} disabled={closingSaving}
              onChange={(event) => setClosingNotes(event.target.value)}
              className={`${nextgenControlClass} mt-1 min-h-24`}/>
          </label>
          <p className="text-sm text-slate-600">
            Saat dikonfirmasi, data akan diambil ulang, dikunci dalam snapshot,
            dihitung, lalu closing langsung masuk status Dalam Review.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t p-4">
          <button type="button" disabled={closingSaving}
            onClick={() => setClosingConfirmOpen(false)}
            className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={closingSaving}
            onClick={() => void createClosingFromPreview()}
            className={nextgenButtonClass}>
            {closingSaving && <LoaderCircle className="animate-spin" size={17}/>}
            {closingSaving ? "Membuat Closing..." : "Buat Closing"}
          </button>
        </div>
      </ModalCard>
    </div>}
  </div>;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, LoaderCircle, Plus, RefreshCw, X } from "lucide-react";
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
import {
  applySelectedKasbon,
  selectedKasbonTotal,
  toggleKasbonSelection,
} from "./salary-closing-kasbon-selection";

type Component = {
  id: string;
  componentName: string;
  sourceType: string;
  quantity: string | null;
  rate: string | null;
  amount: string;
};
type Adjustment = {
  id: string;
  type: "ADDITION" | "DEDUCTION";
  category: string;
  amount: string;
  reason: string;
  voidedAt: string | null;
};
type Allocation = {
  id: string;
  amount: string;
  status: string;
  operationalExpense: {
    id: string;
    operationalDate: string;
    description: string | null;
    amount: string;
  };
};
type EligibleKasbon = {
  id: string;
  operationalDate: string;
  description: string | null;
  amount: string;
  remainingAmount: string;
  matchMethod: string;
};
type Employee = {
  id: string;
  employeeNameSnapshot: string;
  divisionSnapshot: string;
  whatsappSnapshot: string | null;
  salaryProfileCodeSnapshot: string;
  salaryProfileVersionSnapshot: number;
  workDayCount: number;
  sourcePickupCount: number;
  sourceDispatchCount: number;
  systemIncomeTotal: string;
  manualAdditionTotal: string;
  manualDeductionTotal: string;
  netSalary: string;
  status: string;
  components: Component[];
  adjustments: Adjustment[];
  kasbonAllocations: Allocation[];
};
type Source = {
  id: string;
  sourceType: "PICKUP" | "DISPATCH";
  sourceDate: string;
  waybillNumber: string | null;
  calculationStatus: string;
  exclusionReason: string | null;
  calculationType: string | null;
  weight: string | null;
  settlement: string | null;
  freight: string | null;
  rate: string | null;
  amount: string | null;
};
type WarningAssignment = {
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  salaryProfile: {
    id: string;
    name: string;
    version: number;
    status: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  };
};
type WarningSource = {
  id: string;
  sourceType: "PICKUP" | "DISPATCH";
  sourceDate: string;
  waybillNumber: string | null;
  employeeNameRaw: string | null;
  exclusionReason: string | null;
  matchedEmployee: {
    id: string;
    name: string;
    division: string;
    assignments: WarningAssignment[];
  } | null;
};
type AvailableProfile = {
  id: string;
  name: string;
  version: number;
  division: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};
type Closing = {
  id: string;
  closingNumber: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  notes: string | null;
  generatedAt: string | null;
  processedAt: string | null;
  calculationWarningCount: number;
  createdBy: { name: string };
  employees: Employee[];
  sourceRecords: WarningSource[];
  availableProfiles: AvailableProfile[];
  canCancelRecap?: boolean;
  cancelBlockReason?: string | null;
};

const rupiah = (value: string | number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const statusLabel: Record<string, string> = {
  DRAFT: "Draft",
  CLOSED: "Dalam Review",
  COMPLETED: "Closing Success",
  PROCESSED: "Masuk Rekap",
  PAID: "Dibayar",
  VOID: "Dibatalkan",
};
const divisionLabel: Record<string, string> = {
  ADMIN: "Admin",
  ADMIN_OPS: "Admin Ops",
  SALES: "Sales",
  THREE_WHEEL_DRIVER: "Driver Roda Tiga",
  MOTORIST: "Motoris",
  DRIVER: "Driver",
};
const sourceReasonLabel: Record<string, string> = {
  PROFILE_NOT_ASSIGNED: "Salary Profile belum ditetapkan atau belum berlaku.",
  PROFILE_NOT_ACTIVE: "Salary Profile tidak aktif.",
  PROFILE_NOT_EFFECTIVE: "Salary Profile belum atau tidak lagi berlaku pada tanggal aktivitas.",
  PROFILE_SETTING_NOT_FOUND: "Pengaturan salary profile belum lengkap.",
  EMPLOYEE_NOT_MATCHED: "Nama team belum terhubung dengan Informasi Team.",
  EMPLOYEE_NOT_MAPPED: "Nama team belum terhubung dengan Informasi Team.",
  INVALID_FREIGHT: "Nilai Freight tidak dapat dibaca.",
  INVALID_FREIGHT_FOR_PERCENTAGE: "Nilai Freight tidak dapat dibaca.",
  INVALID_WEIGHT: "Nilai berat tidak dapat dibaca.",
  OUTSIDE_WEIGHT_RANGE: "Berat tidak masuk rentang insentif yang ditentukan.",
  AMBIGUOUS_ALIAS: "Alias team terhubung ke lebih dari satu team.",
  AMBIGUOUS_NAME: "Nama team terhubung ke lebih dari satu team.",
};
const adjustmentCategories = {
  ADDITION: ["Bonus", "Insentif", "Lembur", "Koreksi Penghasilan", "Lainnya"],
  DEDUCTION: ["Keterlambatan", "Absensi", "Koreksi Potongan", "Lainnya"],
} as const;
const isAdjustmentReviewed = (status: string) =>
  ["REVIEWED", "PROCESSED", "PAID"].includes(status);

export function SalaryClosingDetailClient({
  closingId,
  canManage,
  canAdjust,
  canProcess,
  readOnly = false,
  detailEndpoint,
}: {
  closingId: string;
  canManage: boolean;
  canAdjust: boolean;
  canProcess: boolean;
  readOnly?: boolean;
  detailEndpoint?: string;
}) {
  const searchParams = useSearchParams();
  const [closing, setClosing] = useState<Closing | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [profileRepairOpen, setProfileRepairOpen] = useState(false);
  const [profileEdits, setProfileEdits] = useState<Record<string, {
    profileId: string;
    effectiveFrom: string;
  }>>({});
  const [kasbonOpen, setKasbonOpen] = useState(false);
  const [eligibleKasbon, setEligibleKasbon] = useState<EligibleKasbon[]>([]);
  const [selectedKasbonIds, setSelectedKasbonIds] = useState<string[]>([]);
  const [adjustmentType, setAdjustmentType] =
    useState<"ADDITION" | "DEDUCTION" | null>(null);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmAction, setConfirmAction] =
    useState<"generate" | "process" | "void" | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidItem, setVoidItem] = useState<{
    type: "adjustment" | "kasbon";
    id: string;
  } | null>(null);
  const [voidItemReason, setVoidItemReason] = useState("");
  const [recapCancelOpen, setRecapCancelOpen] = useState(false);
  const [recapCancelReason, setRecapCancelReason] = useState("");
  const [recapCancelled, setRecapCancelled] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadClosing() {
    setLoading(true);
    try {
      const response = await fetch(detailEndpoint ??
        `/api/finance/salary/closings/${closingId}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()).data as Closing;
      setClosing(data);
      if (selectedEmployee) {
        setSelectedEmployee(
          data.employees.find((row) => row.id === selectedEmployee.id) ?? null,
        );
      }
    } catch {
      setError("Detail Salary Closing gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadClosing());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closingId, detailEndpoint]);

  async function runClosingAction() {
    if (!confirmAction || actionLoading) return;
    if (confirmAction === "void" && voidReason.trim().length < 5) {
      setError("Alasan pembatalan minimal 5 karakter.");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/salary/closings/${closingId}/${confirmAction}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: confirmAction === "void"
            ? JSON.stringify({ reason: voidReason })
            : undefined,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        const teams = result.error?.details?.teamNames;
        throw new Error(teams
          ? `${result.error?.message} Team: ${teams}.`
          : result.error?.message || "Proses salary gagal.");
      }
      const warningCount = result.data?.warnings
        ? result.data.warnings.unmatchedPickup +
          result.data.warnings.unmatchedDispatch
        : 0;
      setNotice(confirmAction === "process"
        ? "Salary berhasil diproses ke Salary Recap."
        : confirmAction === "void"
          ? "Salary Closing berhasil dibatalkan."
          : warningCount
            ? "Salary berhasil dihitung dengan beberapa data yang perlu diperiksa."
            : "Salary berhasil dihitung dan siap direview.");
      setConfirmAction(null);
      setVoidReason("");
      await loadClosing();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Proses salary gagal.");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveProfileAssignment(employeeId: string) {
    const edit = profileEdits[employeeId];
    if (!edit?.profileId || !edit.effectiveFrom || actionLoading) {
      setError("Pilih Salary Profile dan tanggal berlaku.");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/salary/team/${employeeId}/assignment`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(edit),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Assignment Salary Profile gagal disimpan.",
      );
      setNotice("Assignment tersimpan. Jalankan Hitung Ulang untuk memperbarui salary.");
      await loadClosing();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Assignment Salary Profile gagal disimpan.");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveAdjustment() {
    if (!selectedEmployee || !adjustmentType || actionLoading) return;
    setActionLoading(true);
    setError("");
    try {
      const response = await fetch("/api/finance/salary/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          salaryClosingEmployeeId: selectedEmployee.id,
          type: adjustmentType,
          category,
          amount: Number(amount),
          reason,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Adjustment gagal disimpan.",
      );
      setAdjustmentType(null);
      setCategory("");
      setAmount("");
      setReason("");
      setNotice(adjustmentType === "ADDITION"
        ? "Tambahan penghasilan berhasil disimpan."
        : "Potongan manual berhasil disimpan.");
      await loadClosing();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Adjustment gagal disimpan.");
    } finally {
      setActionLoading(false);
    }
  }

  async function openSources(employee: Employee) {
    setActionLoading(true);
    try {
      const response = await fetch(
        `/api/finance/salary/closings/${closingId}/employees/${employee.id}/sources`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      setSources((await response.json()).data);
      setSourcesOpen(true);
    } catch {
      setError("Rincian perhitungan gagal dimuat.");
    } finally {
      setActionLoading(false);
    }
  }

  async function openKasbon(employee: Employee) {
    setActionLoading(true);
    try {
      const response = await fetch(
        `/api/finance/salary/closings/${closingId}/employees/${employee.id}/eligible-kasbon`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const allocatedIds = new Set(employee.kasbonAllocations.map((row) =>
        row.operationalExpense.id
      ));
      setEligibleKasbon(((await response.json()).data as EligibleKasbon[])
        .filter((row) => !allocatedIds.has(row.id)));
      setSelectedKasbonIds([]);
      setKasbonOpen(true);
    } catch {
      setError("Daftar Kasbon gagal dimuat.");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveKasbon() {
    if (!selectedEmployee || actionLoading || !selectedKasbonIds.length) return;
    setActionLoading(true);
    try {
      await applySelectedKasbon(selectedKasbonIds, eligibleKasbon, async (kasbon) => {
        const response = await fetch(
          `/api/finance/salary/closings/${closingId}/employees/${selectedEmployee.id}/kasbon-allocations`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operationalExpenseId: kasbon.id,
              amount: Number(kasbon.remainingAmount),
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(
          result.error?.message || "Potongan Kasbon gagal disimpan.",
        );
      });
      setSelectedKasbonIds([]);
      setKasbonOpen(false);
      setNotice("Potongan Kasbon berhasil diterapkan.");
      await loadClosing();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Potongan Kasbon gagal disimpan.");
    } finally {
      setActionLoading(false);
    }
  }

  async function voidReviewItem() {
    if (!voidItem || actionLoading) return;
    if (voidItemReason.trim().length < 5) {
      setError("Alasan pembatalan minimal 5 karakter.");
      return;
    }
    setActionLoading(true);
    try {
      const endpoint = voidItem.type === "adjustment"
        ? `/api/finance/salary/adjustments/${voidItem.id}/void`
        : `/api/finance/salary/kasbon-allocations/${voidItem.id}/void`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: voidItemReason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Pembatalan gagal disimpan.",
      );
      setVoidItem(null);
      setVoidItemReason("");
      setNotice("Pembatalan berhasil disimpan.");
      await loadClosing();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Pembatalan gagal disimpan.");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveAdjustmentReview() {
    if (!selectedEmployee || actionLoading) return;
    const employeeName = selectedEmployee.employeeNameSnapshot;
    setActionLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/salary/closings/${closingId}/employees/${selectedEmployee.id}/review`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Adjustment gagal dikonfirmasi.",
      );
      setNotice(`Adjustment ${employeeName} selesai disimpan.`);
      await loadClosing();
      setSelectedEmployee(null);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Adjustment gagal dikonfirmasi.");
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelRecap() {
    if (actionLoading || recapCancelReason.trim().length < 5) {
      if (recapCancelReason.trim().length < 5) {
        setError("Alasan pembatalan minimal 5 karakter.");
      }
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/salary/recaps/${closingId}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: recapCancelReason }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Salary Recap gagal dibatalkan.",
      );
      setRecapCancelOpen(false);
      setRecapCancelled(true);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Salary Recap gagal dibatalkan.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading && !closing) {
    return <div className="grid min-h-64 place-items-center">
      <LoaderCircle className="animate-spin text-blue-600"/>
    </div>;
  }
  if (!closing) return <p>Salary Closing tidak ditemukan.</p>;
  if (recapCancelled) {
    return <div className="space-y-4">
      <div role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        Salary Recap berhasil dibatalkan dan dikembalikan ke Dalam Review.
      </div>
      <Link href={`/dashboard/finance/salary-closing/${closingId}`}
        className={nextgenButtonClass}>Buka Salary Closing</Link>
    </div>;
  }
  const finalReadOnly = readOnly || closing.status === "COMPLETED";
  const reviewedTeamCount = closing.employees.filter(
    (employee) => isAdjustmentReviewed(employee.status),
  ).length;
  const pendingTeamCount = closing.employees.length - reviewedTeamCount;
  const allTeamsReviewed = closing.employees.length > 0 && pendingTeamCount === 0;

  const totals = closing.employees.reduce((result, employee) => ({
    workDays: result.workDays + employee.workDayCount,
    pickup: result.pickup + employee.sourcePickupCount,
    dispatch: result.dispatch + employee.sourceDispatchCount,
    system: result.system + Number(employee.systemIncomeTotal),
    addition: result.addition + Number(employee.manualAdditionTotal),
    deduction: result.deduction + Number(employee.manualDeductionTotal),
    net: result.net + Number(employee.netSalary),
    kasbon: result.kasbon + employee.kasbonAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.amount),
      0,
    ),
  }), {
    workDays: 0, pickup: 0, dispatch: 0, system: 0,
    addition: 0, deduction: 0, net: 0, kasbon: 0,
  });
  const profileIssueGroups = [...closing.sourceRecords.reduce((groups, source) => {
    if (!source.matchedEmployee ||
      !source.exclusionReason?.startsWith("PROFILE_")) return groups;
    const employee = source.matchedEmployee;
    const existing = groups.get(employee.id) ?? {
      employee,
      pickupCount: 0,
      dispatchCount: 0,
      firstActivityDate: source.sourceDate,
      reasons: new Set<string>(),
    };
    if (source.sourceType === "PICKUP") existing.pickupCount += 1;
    else existing.dispatchCount += 1;
    if (source.sourceDate < existing.firstActivityDate) {
      existing.firstActivityDate = source.sourceDate;
    }
    existing.reasons.add(source.exclusionReason);
    groups.set(employee.id, existing);
    return groups;
  }, new Map<string, {
    employee: NonNullable<WarningSource["matchedEmployee"]>;
    pickupCount: number;
    dispatchCount: number;
    firstActivityDate: string;
    reasons: Set<string>;
  }>()).values()];

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title={closing.closingNumber}
      description={`${closing.periodStart.slice(0, 10)} — ${closing.periodEnd.slice(0, 10)}`}
      actions={<>
        <Link href="/dashboard/finance/salary-closing"
          className={nextgenNeutralButtonClass}>Kembali</Link>
        {closing.canCancelRecap && <button type="button"
          disabled={actionLoading}
          onClick={() => {
            setRecapCancelReason("");
            setRecapCancelOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
          Batalkan Rekap
        </button>}
        {!finalReadOnly && canManage && closing.status === "DRAFT" &&
          <button type="button" disabled={actionLoading}
            onClick={() => setConfirmAction("generate")}
            className={nextgenButtonClass}>
            <RefreshCw size={17}/>Generate Salary
          </button>}
        {!finalReadOnly && canManage && closing.status === "CLOSED" &&
          <button type="button" disabled={actionLoading}
            onClick={() => setConfirmAction("generate")}
            className={nextgenNeutralButtonClass}>
            <RefreshCw size={17}/>Hitung Ulang
          </button>}
        {!finalReadOnly && canProcess && closing.status === "CLOSED" &&
          allTeamsReviewed &&
          <button type="button" disabled={actionLoading}
            onClick={() => setConfirmAction("process")}
            className={nextgenButtonClass}>Proses ke Salary Recap</button>}
        {!finalReadOnly && canManage && ["DRAFT", "CLOSED"].includes(closing.status) &&
          <button type="button" disabled={actionLoading}
            onClick={() => setConfirmAction("void")}
            className={nextgenNeutralButtonClass}>Void Closing</button>}
      </>}/>
    {searchParams.get("fromPreview") === "1" && <div role="status"
      className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      Data Salary telah diambil ulang dan dikunci pada waktu closing dibuat.
      Hasil closing ini menjadi source of truth jika berbeda dari preview sebelumnya.
    </div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {finalReadOnly && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      {closing.status === "COMPLETED"
        ? "Closing Success sudah final dan tidak dapat dibatalkan dari menu ini."
        : "Salary sudah diproses dan dikunci."}
    </div>}
    {closing.cancelBlockReason && <div
      className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      {closing.cancelBlockReason}
    </div>}
    <AppCard className="grid gap-3 p-5 text-sm md:grid-cols-3">
      <p><span className="text-slate-500">Status</span><br/><strong>{statusLabel[closing.status] ?? closing.status}</strong></p>
      <p><span className="text-slate-500">Dibuat Oleh</span><br/><strong>{closing.createdBy.name}</strong></p>
      <p><span className="text-slate-500">Catatan</span><br/><strong>{closing.notes || "—"}</strong></p>
      <p><span className="text-slate-500">Generated At</span><br/><strong>{closing.generatedAt?.slice(0, 19).replace("T", " ") || "—"}</strong></p>
      <p><span className="text-slate-500">Processed At</span><br/><strong>{closing.processedAt?.slice(0, 19).replace("T", " ") || "—"}</strong></p>
    </AppCard>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Jumlah Team" value={closing.employees.length}/>
      <MetricCard label="Hari Kerja Total" value={totals.workDays}/>
      <MetricCard label="Pickup Terhitung" value={totals.pickup}/>
      <MetricCard label="Dispatch Terhitung" value={totals.dispatch}/>
      <MetricCard label="Penghasilan Sistem" value={rupiah(totals.system)}/>
      <MetricCard label="Tambahan" value={rupiah(totals.addition)}/>
      <MetricCard label="Potongan Manual"
        value={rupiah(Math.max(0, totals.deduction - totals.kasbon))}/>
      <MetricCard label="Potongan Kasbon" value={rupiah(totals.kasbon)}/>
      <MetricCard label="Total Bersih" value={rupiah(totals.net)}/>
    </div>
    {closing.sourceRecords.length > 0 && <SectionCard
      title="Data tidak terpetakan">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Pickup: {closing.sourceRecords.filter((row) => row.sourceType === "PICKUP").length} record · Dispatch: {closing.sourceRecords.filter((row) => row.sourceType === "DISPATCH").length} record
      </div>
      {!finalReadOnly && canManage && profileIssueGroups.length > 0 &&
        <button type="button" onClick={() => {
          setProfileEdits(Object.fromEntries(profileIssueGroups.map((group) => {
            const assignment = group.employee.assignments[0];
            return [group.employee.id, {
              profileId: assignment?.salaryProfile.id ?? "",
              effectiveFrom: closing.periodStart.slice(0, 10),
            }];
          })));
          setProfileRepairOpen(true);
        }} className={`${nextgenButtonClass} mt-3`}>
          Perbaiki Profile Team
        </button>}
      <TableCard className="mt-3"><div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead><tr>{["Tanggal", "Sumber", "Nama Sumber", "Waybill", "Alasan"]
            .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
          <tbody>{closing.sourceRecords.map((row) => <tr key={row.id}>
            <td className="px-3 py-3">{row.sourceDate.slice(0, 10)}</td>
            <td className="px-3 py-3">{row.sourceType === "PICKUP" ? "Pickup" : "Dispatch"}</td>
            <td className="px-3 py-3">{row.employeeNameRaw || "—"}</td>
            <td className="px-3 py-3">{row.waybillNumber || "—"}</td>
            <td className="px-3 py-3">
              {sourceReasonLabel[row.exclusionReason ?? ""] ??
                "Data belum dapat dihitung."}
            </td>
          </tr>)}</tbody>
        </table>
      </div></TableCard>
    </SectionCard>}
    <SectionCard title="Team Salary">
      <div className={`mb-4 rounded-xl border p-4 text-sm ${allTeamsReviewed
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <p className="font-bold">
          Penyesuaian Team: {reviewedTeamCount} dari {closing.employees.length} selesai
        </p>
        <p className="mt-1">
          {allTeamsReviewed
            ? "Seluruh team sudah selesai disesuaikan dan siap diproses ke Salary Recap."
            : `Masih ada ${pendingTeamCount} team yang belum disesuaikan.`}
        </p>
      </div>
      <TableCard><div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nama", "Divisi", "Hari Kerja", "Penghasilan Sistem", "Tambahan", "Potongan", "Total Bersih", "Status Adjustment", "Aksi"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{closing.employees.map((employee) => <tr key={employee.id}>
            <td className="px-3 py-3 font-semibold">{employee.employeeNameSnapshot}</td>
            <td className="px-3 py-3">{divisionLabel[employee.divisionSnapshot] ?? employee.divisionSnapshot}</td>
            <td className="px-3 py-3">{employee.workDayCount}</td>
            <td className="px-3 py-3">{rupiah(employee.systemIncomeTotal)}</td>
            <td className="px-3 py-3">{rupiah(employee.manualAdditionTotal)}</td>
            <td className="px-3 py-3">{rupiah(employee.manualDeductionTotal)}</td>
            <td className="px-3 py-3 font-semibold">{rupiah(employee.netSalary)}</td>
            <td className={`px-3 py-3 font-bold ${isAdjustmentReviewed(employee.status)
              ? "text-emerald-700"
              : "text-rose-700"}`}>
              {isAdjustmentReviewed(employee.status)
                ? "Selesai Disesuaikan"
                : "Belum Disesuaikan"}
            </td>
            <td className="px-3 py-3"><button type="button"
              onClick={() => setSelectedEmployee(employee)}
              className={nextgenNeutralButtonClass}><ClipboardCheck size={16}/>Adjustment</button></td>
          </tr>)}</tbody>
        </table>
        {!closing.employees.length && <p className="p-8 text-center text-sm text-slate-500">
          Generate Salary untuk membuat hasil per team.
        </p>}
      </div></TableCard>
    </SectionCard>

    {selectedEmployee && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-3">
      <ModalCard className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b p-5">
          <div><p className="text-sm text-slate-500">Review dan Penyesuaian Team</p>
            <h2 className="text-xl font-bold">
              Adjustment Salary — {selectedEmployee.employeeNameSnapshot}
            </h2></div>
          <button type="button" onClick={() => setSelectedEmployee(null)}><X/></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <AppCard className="grid gap-3 p-4 text-sm md:grid-cols-3">
            <p>Divisi<br/><strong>{divisionLabel[selectedEmployee.divisionSnapshot]}</strong></p>
            <p>WhatsApp<br/><strong>{selectedEmployee.whatsappSnapshot || "—"}</strong></p>
            <p>Salary Profile<br/><strong>{selectedEmployee.salaryProfileCodeSnapshot} v{selectedEmployee.salaryProfileVersionSnapshot}</strong></p>
            <p>Hari Kerja<br/><strong>{selectedEmployee.workDayCount}</strong></p>
            <p>Pickup<br/><strong>{selectedEmployee.sourcePickupCount}</strong></p>
            <p>Dispatch<br/><strong>{selectedEmployee.sourceDispatchCount}</strong></p>
          </AppCard>
          <SectionCard title="Komponen Penghasilan Sistem">
            <div className="space-y-2">{selectedEmployee.components.map((component) =>
              <div key={component.id} className="flex justify-between rounded-xl border p-3 text-sm">
                <span>{component.componentName}<small className="block text-slate-500">
                  {component.quantity ?? "—"} × {component.rate ? rupiah(component.rate) : "—"}
                </small></span>
                <strong>{rupiah(component.amount)}</strong>
              </div>)}
            {!selectedEmployee.components.length && <p className="text-sm text-slate-500">Belum ada komponen sistem.</p>}</div>
          </SectionCard>
          <SectionCard title="Tambahan dan Potongan Manual">
            <div className="space-y-2">{selectedEmployee.adjustments
              .filter((row) => !row.voidedAt).map((row) =>
                <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>{row.category}<small className="block text-slate-500">{row.reason}</small></span>
                  <span className="flex items-center gap-2">
                    <strong>{row.type === "DEDUCTION" ? "−" : "+"}{rupiah(row.amount)}</strong>
                    {!finalReadOnly && closing.status === "CLOSED" && canAdjust &&
                      <button type="button" onClick={() => setVoidItem({
                        type: "adjustment",
                        id: row.id,
                      })} className={nextgenNeutralButtonClass}>Batalkan</button>}
                  </span>
                </div>)}
            {!selectedEmployee.adjustments.some((row) => !row.voidedAt) &&
              <p className="text-sm text-slate-500">Belum ada adjustment.</p>}</div>
          </SectionCard>
          <SectionCard title="Potongan Kasbon">
            <div className="space-y-2">{selectedEmployee.kasbonAllocations.map((row) =>
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                <span>{row.operationalExpense.operationalDate.slice(0, 10)}
                  <small className="block text-slate-500">{row.operationalExpense.description || "Kasbon"}</small></span>
                <span className="flex items-center gap-2">
                  <strong>{rupiah(row.amount)}</strong>
                  {!finalReadOnly && closing.status === "CLOSED" && canAdjust &&
                    <button type="button" onClick={() => setVoidItem({
                      type: "kasbon",
                      id: row.id,
                    })} className={nextgenNeutralButtonClass}>Batalkan</button>}
                </span>
              </div>)}
            {!selectedEmployee.kasbonAllocations.length &&
              <p className="text-sm text-slate-500">Belum ada alokasi Kasbon.</p>}</div>
          </SectionCard>
          <AppCard className="grid gap-3 p-4 text-sm sm:grid-cols-5">
            <p>Penghasilan Sistem<br/><strong>{rupiah(selectedEmployee.systemIncomeTotal)}</strong></p>
            <p>Tambahan<br/><strong>{rupiah(selectedEmployee.manualAdditionTotal)}</strong></p>
            <p>Potongan Manual<br/><strong>{rupiah(Math.max(0,
              Number(selectedEmployee.manualDeductionTotal) -
              selectedEmployee.kasbonAllocations.reduce(
                (sum, allocation) => sum + Number(allocation.amount), 0,
              ),
            ))}</strong></p>
            <p>Kasbon<br/><strong>{rupiah(selectedEmployee.kasbonAllocations.reduce(
              (sum, allocation) => sum + Number(allocation.amount), 0,
            ))}</strong></p>
            <p>Total Bersih<br/><strong>{rupiah(selectedEmployee.netSalary)}</strong></p>
          </AppCard>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-white p-4">
          <button type="button" disabled={actionLoading}
            onClick={() => void openSources(selectedEmployee)}
            className={nextgenNeutralButtonClass}>Lihat Rincian Sumber</button>
          {!finalReadOnly && canAdjust && closing.status === "CLOSED" && <>
            <button type="button" onClick={() => setAdjustmentType("ADDITION")}
              className={nextgenNeutralButtonClass}><Plus size={16}/>Tambah Penghasilan</button>
            <button type="button" onClick={() => setAdjustmentType("DEDUCTION")}
              className={nextgenNeutralButtonClass}><Plus size={16}/>Tambah Potongan</button>
            <button type="button" onClick={() => void openKasbon(selectedEmployee)}
              className={nextgenNeutralButtonClass}>Atur Kasbon</button>
            <button type="button" disabled={actionLoading}
              onClick={() => void saveAdjustmentReview()}
              className={nextgenButtonClass}>
              {actionLoading && <LoaderCircle className="animate-spin" size={16}/>}
              Simpan Adjustment
            </button>
          </>}
        </div>
      </ModalCard>
    </div>}

    {adjustmentType && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-lg">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-xl font-bold">{adjustmentType === "ADDITION" ? "Tambah Penghasilan" : "Tambah Potongan"}</h2>
          <button type="button" onClick={() => setAdjustmentType(null)}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block text-sm font-semibold">Kategori
            <select value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={`${nextgenControlClass} mt-1 w-full`}>
              <option value="">Pilih Kategori</option>
              {adjustmentCategories[adjustmentType].map((option) =>
                <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Nominal
            <input type="number" min="1" value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={`${nextgenControlClass} mt-1 w-full`}/></label>
          <label className="block text-sm font-semibold">Alasan
            <textarea value={reason} onChange={(event) => setReason(event.target.value)}
              className={`${nextgenControlClass} mt-1 h-24 w-full`}/></label>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" onClick={() => setAdjustmentType(null)}
            className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={actionLoading}
            onClick={() => void saveAdjustment()} className={nextgenButtonClass}>
            {actionLoading && <LoaderCircle className="animate-spin" size={16}/>}
            Simpan
          </button>
        </div>
      </ModalCard>
    </div>}

    {sourcesOpen && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-3">
      <ModalCard className="max-w-6xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-xl font-bold">Rincian Perhitungan</h2>
          <button type="button" onClick={() => setSourcesOpen(false)}><X/></button>
        </div>
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead><tr>{["Tanggal", "Sumber", "Waybill", "Berat", "Settlement", "Freight", "Jenis Hitung", "Rate", "Nominal", "Status"]
              .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>{sources.map((source) => <tr key={source.id}>
              <td className="px-3 py-3">{source.sourceDate.slice(0, 10)}</td>
              <td className="px-3 py-3">{source.sourceType === "PICKUP" ? "Pickup" : "Dispatch"}</td>
              <td className="px-3 py-3">{source.waybillNumber || "—"}</td>
              <td className="px-3 py-3">{source.weight || "—"}</td>
              <td className="px-3 py-3">{source.settlement || "—"}</td>
              <td className="px-3 py-3">{source.freight ? rupiah(source.freight) : "—"}</td>
              <td className="px-3 py-3">{source.calculationType || "Tidak dihitung"}</td>
              <td className="px-3 py-3">{source.rate || "—"}</td>
              <td className="px-3 py-3">{source.amount ? rupiah(source.amount) : "—"}</td>
              <td className="px-3 py-3">{source.exclusionReason || "Terhitung"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </ModalCard>
    </div>}

    {kasbonOpen && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-xl font-bold">Atur Potongan Kasbon</h2>
          <button type="button" onClick={() => {
            setSelectedKasbonIds([]);
            setKasbonOpen(false);
          }}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          <fieldset>
            <legend className="text-sm font-semibold">Kasbon</legend>
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {eligibleKasbon.map((row) => {
                const checked = selectedKasbonIds.includes(row.id);
                return <label key={row.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={checked}
                    onChange={() => setSelectedKasbonIds((current) =>
                      toggleKasbonSelection(current, row.id)
                    )}
                    className="mt-0.5 size-4 shrink-0 accent-blue-600"/>
                  <span>{row.operationalDate.slice(0, 10)} · {row.description || "Kasbon"} · Sisa {rupiah(row.remainingAmount)}</span>
                </label>;
              })}
            </div>
          </fieldset>
          {!!selectedKasbonIds.length && <p className="text-xs font-medium text-slate-600">
            {selectedKasbonIds.length} kasbon dipilih · Total dipilih {rupiah(
              selectedKasbonTotal(selectedKasbonIds, eligibleKasbon)
            )}
          </p>}
          {!eligibleKasbon.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Tidak ada Kasbon aktif untuk team dan periode ini.
          </p>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" onClick={() => {
            setSelectedKasbonIds([]);
            setKasbonOpen(false);
          }}
            className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={actionLoading || !selectedKasbonIds.length}
            onClick={() => void saveKasbon()} className={nextgenButtonClass}>
            {actionLoading && <LoaderCircle className="animate-spin" size={16}/>}
            Terapkan Kasbon
          </button>
        </div>
      </ModalCard>
    </div>}

    {profileRepairOpen && <div className="fixed inset-0 z-[65] grid place-items-center bg-slate-950/55 p-3">
      <ModalCard className="max-w-7xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-xl font-bold">Perbaiki Profile Team</h2>
            <p className="text-sm text-slate-500">
              Satu assignment berlaku untuk seluruh aktivitas team pada tanggal yang tercakup.
            </p>
          </div>
          <button type="button" disabled={actionLoading}
            aria-label="Tutup Perbaiki Profile Team"
            onClick={() => setProfileRepairOpen(false)}><X/></button>
        </div>
        <div className="max-h-[72vh] overflow-auto p-5">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead><tr>
              {["Nama Team", "Divisi", "Pickup", "Dispatch", "Profile Saat Ini",
                "Tanggal Assignment", "Tanggal Aktivitas", "Mulai Closing", "Masalah",
                "Profile Baru", "Tanggal Berlaku", "Aksi"]
                .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y">{profileIssueGroups.map((group) => {
              const assignment = group.employee.assignments[0];
              const edit = profileEdits[group.employee.id] ?? {
                profileId: "",
                effectiveFrom: closing.periodStart.slice(0, 10),
              };
              return <tr key={group.employee.id}>
                <td className="px-3 py-3 font-semibold">{group.employee.name}</td>
                <td className="px-3 py-3">
                  {divisionLabel[group.employee.division] ?? group.employee.division}
                </td>
                <td className="px-3 py-3">{group.pickupCount}</td>
                <td className="px-3 py-3">{group.dispatchCount}</td>
                <td className="px-3 py-3">
                  {assignment
                    ? `${assignment.salaryProfile.name} v${assignment.salaryProfile.version}`
                    : "Belum ada"}
                </td>
                <td className="px-3 py-3">
                  {assignment?.effectiveFrom.slice(0, 10) ?? "—"}
                </td>
                <td className="px-3 py-3">
                  {group.firstActivityDate.slice(0, 10)}
                </td>
                <td className="px-3 py-3">{closing.periodStart.slice(0, 10)}</td>
                <td className="max-w-64 px-3 py-3">
                  {[...group.reasons].map((reason) =>
                    sourceReasonLabel[reason] ?? "Profile belum dapat digunakan."
                  ).join(" ")}
                </td>
                <td className="px-3 py-3">
                  <select aria-label={`Salary Profile ${group.employee.name}`}
                    value={edit.profileId}
                    onChange={(event) => setProfileEdits((current) => ({
                      ...current,
                      [group.employee.id]: {
                        ...edit,
                        profileId: event.target.value,
                      },
                    }))}
                    className={`${nextgenControlClass} min-w-56`}>
                    <option value="">Pilih Profile</option>
                    {closing.availableProfiles
                      .filter((profile) =>
                        profile.division === group.employee.division
                      )
                      .map((profile) => <option key={profile.id} value={profile.id}>
                        {profile.name} · v{profile.version}
                      </option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <input aria-label={`Tanggal Berlaku ${group.employee.name}`}
                    type="date" value={edit.effectiveFrom}
                    onChange={(event) => setProfileEdits((current) => ({
                      ...current,
                      [group.employee.id]: {
                        ...edit,
                        effectiveFrom: event.target.value,
                      },
                    }))}
                    className={nextgenControlClass}/>
                  <button type="button" className="mt-1 text-xs font-semibold text-blue-700"
                    onClick={() => setProfileEdits((current) => ({
                      ...current,
                      [group.employee.id]: {
                        ...edit,
                        effectiveFrom: closing.periodStart.slice(0, 10),
                      },
                    }))}>
                    Terapkan mulai awal periode closing
                  </button>
                </td>
                <td className="px-3 py-3">
                  <button type="button" disabled={actionLoading}
                    onClick={() => void saveProfileAssignment(group.employee.id)}
                    className={nextgenButtonClass}>
                    {actionLoading && <LoaderCircle className="animate-spin" size={16}/>}
                    Atur Salary Profile
                  </button>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="flex justify-between gap-3 border-t p-4 text-sm">
          <p className="text-slate-500">
            Setelah assignment selesai, tutup modal lalu klik Hitung Ulang.
          </p>
          <button type="button" disabled={actionLoading}
            onClick={() => setProfileRepairOpen(false)}
            className={nextgenNeutralButtonClass}>Selesai</button>
        </div>
      </ModalCard>
    </div>}

    {confirmAction && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-lg">
        <div className="border-b p-5"><h2 className="text-xl font-bold">
          {confirmAction === "process" ? "Proses ke Salary Recap"
              : confirmAction === "void" ? "Void Salary Closing"
                : closing.status === "CLOSED" ? "Hitung Ulang Salary" : "Generate Salary"}
        </h2></div>
        <div className="space-y-4 p-5 text-sm text-slate-600">
          <p>{confirmAction === "generate" && closing.status === "CLOSED"
            ? "Perhitungan sistem akan dibuat ulang berdasarkan data operasional dan Salary Setting terbaru. Tambahan dan potongan manual tetap dipertahankan."
            : confirmAction === "process"
              ? "Hasil salary akan dikunci dan masuk Salary Recap."
              : confirmAction === "void"
                ? "Source reservation dan alokasi Kasbon draft akan dilepas."
                : "Data operasional pada periode ini akan dihitung ke Salary Closing."}</p>
          {confirmAction === "void" && <textarea value={voidReason}
            placeholder="Alasan pembatalan"
            onChange={(event) => setVoidReason(event.target.value)}
            className={`${nextgenControlClass} h-24 w-full`}/>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" disabled={actionLoading}
            onClick={() => setConfirmAction(null)}
            className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={actionLoading}
            onClick={() => void runClosingAction()} className={nextgenButtonClass}>
            {actionLoading && <LoaderCircle className="animate-spin" size={16}/>}
            {actionLoading ? "Memproses..." : "Lanjutkan"}
          </button>
        </div>
      </ModalCard>
    </div>}

    {recapCancelOpen && <div className="fixed inset-0 z-[75] grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <p className="text-sm font-semibold text-rose-700">Konfirmasi Pembatalan</p>
            <h2 className="text-xl font-bold">Batalkan Rekap</h2>
          </div>
          <button type="button" disabled={actionLoading}
            aria-label="Tutup modal Batalkan Rekap"
            onClick={() => setRecapCancelOpen(false)}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          <AppCard className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <p>Nomor Closing<br/><strong>{closing.closingNumber}</strong></p>
            <p>Periode<br/><strong>{closing.periodStart.slice(0, 10)} — {closing.periodEnd.slice(0, 10)}</strong></p>
            <p>Jumlah Team<br/><strong>{closing.employees.length}</strong></p>
            <p>Total Bersih<br/><strong>{rupiah(totals.net)}</strong></p>
          </AppCard>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Data akan kembali ke tahap review dan seluruh team wajib menyimpan Adjustment kembali.
          </p>
          <label className="block text-sm font-semibold">Alasan Pembatalan
            <textarea value={recapCancelReason} disabled={actionLoading}
              onChange={(event) => setRecapCancelReason(event.target.value)}
              className={`${nextgenControlClass} mt-1 h-24 w-full`}/>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" disabled={actionLoading}
            onClick={() => setRecapCancelOpen(false)}
            className={nextgenNeutralButtonClass}>Kembali</button>
          <button type="button" disabled={actionLoading}
            onClick={() => void cancelRecap()}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            {actionLoading && <LoaderCircle className="animate-spin" size={16}/>}
            {actionLoading ? "Membatalkan..." : "Batalkan Rekap"}
          </button>
        </div>
      </ModalCard>
    </div>}

    {voidItem && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-lg">
        <div className="border-b p-5">
          <h2 className="text-xl font-bold">
            {voidItem.type === "adjustment"
              ? "Batalkan Adjustment"
              : "Batalkan Potongan Kasbon"}
          </h2>
        </div>
        <div className="p-5">
          <label className="block text-sm font-semibold">Alasan pembatalan
            <textarea value={voidItemReason}
              onChange={(event) => setVoidItemReason(event.target.value)}
              className={`${nextgenControlClass} mt-1 h-24 w-full`}/>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" disabled={actionLoading}
            onClick={() => setVoidItem(null)}
            className={nextgenNeutralButtonClass}>Batal</button>
          <button type="button" disabled={actionLoading}
            onClick={() => void voidReviewItem()} className={nextgenButtonClass}>
            {actionLoading && <LoaderCircle className="animate-spin" size={16}/>}
            Batalkan
          </button>
        </div>
      </ModalCard>
    </div>}
  </div>;
}

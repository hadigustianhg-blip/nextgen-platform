"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Download,
  FileCheck,
  FileSpreadsheet,
  Filter,
  Info,
  LocateFixed,
  MapPin,
  Pencil,
  PieChart,
  RefreshCw,
  Save,
  UserCheck,
  UserX,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { AppCard, PageHeader, nextgenButtonClass, nextgenControlClass } from "@/components/ui";
import { downloadFile } from "@/lib/files/download-file";

type LocationData = {
  outlet: { code: string; name: string };
  setting: { latitude: number; longitude: number; radiusMeters: number; isActive: boolean } | null;
};

type DayCell = {
  status: "PRESENT" | "ABSENT" | "PERMISSION" | "SICK" | "LEAVE" | "OFF";
  recordId?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  leaveRequestId?: string;
  leaveReason?: string;
};

type EmployeeMatrixRow = {
  id: string;
  name: string;
  division: string;
  days: Record<string, DayCell>;
};

type PendingApprovalItem = {
  id: string;
  employeeName: string;
  division: string;
  type: "LEAVE" | "PERMISSION" | "SICK";
  startDate: string;
  endDate: string;
  reason: string;
  submittedAt: string;
};

type MonitoringData = {
  summary: {
    totalTeam: number;
    presentToday: number;
    absentToday: number;
    pendingLeaveCount: number;
  };
  month: string;
  daysInMonth: number;
  todayStr: string;
  employees: EmployeeMatrixRow[];
  pendingSummary: PendingApprovalItem[];
};

type ReportEmployeeRow = {
  id: string;
  name: string;
  division: string;
  presentDays: number;
  lateDays: number;
  permissionDays: number;
  sickDays: number;
  leaveDays: number;
  absentDays: number;
  attendanceRate: number;
  dailyBreakdown: Array<{
    date: string;
    status: "PRESENT" | "ABSENT" | "PERMISSION" | "SICK" | "LEAVE" | "OFF";
    checkInAt: string | null;
    checkOutAt: string | null;
    leaveReason?: string;
  }>;
};

type ReportData = {
  summary: {
    totalTeam: number;
    averageRate: number;
    totalAbsent: number;
    totalLeaves: number;
  };
  period: {
    month: string;
    daysInMonth: number;
    workableDays: number;
    outletCode: string;
  };
  employees: ReportEmployeeRow[];
};

type AdminLeaveRow = {
  id: string;
  type: "LEAVE" | "PERMISSION" | "SICK";
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  submittedAt: string;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  employeeName?: string | null;
  division?: string | null;
  employee?: {
    id?: string;
    name?: string | null;
    division?: string | null;
  } | null;
  reviewer?: {
    id?: string;
    name?: string | null;
  } | null;
};

type ApiBody = {
  success?: boolean;
  data?: unknown;
  summary?: { PENDING: number; APPROVED: number; REJECTED: number; CANCELLED: number };
  pagination?: { total: number };
  error?: { code?: string };
};

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: ApiBody | null = null;
  try {
    body = text ? (JSON.parse(text) as ApiBody) : null;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.success) {
    throw new Error(
      body?.error?.code === "FORBIDDEN"
        ? "Anda tidak memiliki izin untuk tindakan ini."
        : "Permintaan gagal.",
    );
  }
  return body;
}

const formatTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value))
    : "—";

const formatDateId = (dateStr: string) => {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

const getDayAbbrev = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day);
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  return days[date.getDay()];
};

function calculateDaysDuration(startStr: string, endStr: string) {
  try {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  } catch {
    return 1;
  }
}

export function AttendanceAdminClient({ canCorrect }: { canCorrect: boolean }) {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"monitoring" | "approval" | "reports">(
    initialTabParam === "approval"
      ? "approval"
      : initialTabParam === "reports"
      ? "reports"
      : "monitoring",
  );

  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("");

  const [approvals, setApprovals] = useState<AdminLeaveRow[]>([]);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState("PENDING");
  const [approvalTypeFilter, setApprovalTypeFilter] = useState("");
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Location settings modal
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [locationForm, setLocationForm] = useState({
    latitude: "",
    longitude: "",
    radiusMeters: "100",
    isActive: true,
  });

  // Cell Detail modal
  const [selectedCell, setSelectedCell] = useState<{
    employeeName: string;
    date: string;
    cell: DayCell;
  } | null>(null);

  // Employee Report Detail modal
  const [selectedReportEmp, setSelectedReportEmp] = useState<ReportEmployeeRow | null>(null);

  function useCurrentLocation() {
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocationForm((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        })),
      () => setError("Lokasi browser tidak dapat diambil."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const loadMonitoring = useCallback(async () => {
    try {
      const query = new URLSearchParams({ month });
      if (search.trim()) query.set("search", search.trim());
      if (division) query.set("division", division);

      const res = await api(`/api/hr/attendance/monitoring?${query}`);
      setMonitoringData(res.data as MonitoringData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat monitoring absensi.");
    }
  }, [month, search, division]);

  const loadReport = useCallback(async () => {
    try {
      const query = new URLSearchParams({ month });
      if (search.trim()) query.set("search", search.trim());
      if (division) query.set("division", division);

      const res = await api(`/api/hr/attendance/report?${query}`);
      setReportData(res.data as ReportData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat rekap absensi.");
    }
  }, [month, search, division]);

  const loadApprovals = useCallback(async () => {
    try {
      const query = new URLSearchParams({ page: "1", pageSize: "50" });
      if (approvalStatusFilter) query.set("status", approvalStatusFilter);
      if (approvalTypeFilter) query.set("type", approvalTypeFilter);

      const res = await api(`/api/hr/leave?${query}`);
      setApprovals((res.data as AdminLeaveRow[]) ?? []);
    } catch (cause) {
      // Allow soft failure for approval list
    }
  }, [approvalStatusFilter, approvalTypeFilter]);

  const loadLocation = useCallback(async () => {
    try {
      const res = await api("/api/hr/attendance/location");
      const data = res.data as LocationData;
      setLocation(data);
      if (data.setting) {
        setLocationForm({
          latitude: String(data.setting.latitude),
          longitude: String(data.setting.longitude),
          radiusMeters: String(data.setting.radiusMeters),
          isActive: data.setting.isActive,
        });
      }
    } catch {
      // Soft fail
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError("");
    await Promise.all([loadMonitoring(), loadReport(), loadApprovals(), loadLocation()]);
    setLoading(false);
  }, [loadMonitoring, loadReport, loadApprovals, loadLocation]);

  useEffect(() => {
    queueMicrotask(() => void refreshAll());
  }, [refreshAll]);

  const handleApprove = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    setError("");
    setMessage("");
    try {
      const notes = actionNotes[id] || undefined;
      await api(`/api/hr/leave/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: notes }),
      });
      setMessage("Pengajuan berhasil disetujui.");
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyetujui pengajuan.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    setError("");
    setMessage("");
    try {
      const notes = actionNotes[id] || undefined;
      await api(`/api/hr/leave/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: notes }),
      });
      setMessage("Pengajuan berhasil ditolak.");
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menolak pengajuan.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveLocation = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setError("");
    try {
      await api("/api/hr/attendance/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: Number(locationForm.latitude),
          longitude: Number(locationForm.longitude),
          radiusMeters: Number(locationForm.radiusMeters),
          isActive: locationForm.isActive,
        }),
      });
      setMessage("Lokasi absensi berhasil disimpan.");
      setShowLocationModal(false);
      await loadLocation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lokasi gagal disimpan.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const query = new URLSearchParams({ month });
      if (search.trim()) query.set("search", search.trim());
      if (division) query.set("division", division);

      await downloadFile(`/api/hr/attendance/report/export?${query}`);
      setMessage("File Excel rekap absensi berhasil diunduh.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengunduh Excel.");
    } finally {
      setExporting(false);
    }
  };

  const changeMonth = (offset: number) => {
    const [yStr, mStr] = month.split("-");
    const d = new Date(Number(yStr), Number(mStr) - 1 + offset, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(newMonth);
  };

  const [yearNum, monthNum] = month.split("-").map(Number);
  const daysInMonth = monitoringData?.daysInMonth ?? 31;
  const pendingCount = monitoringData?.summary.pendingLeaveCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Finance & HR"
          title="Absensi & Kehadiran"
          description="Monitoring matrix kehadiran harian team per outlet, persetujuan pengajuan, dan rekap laporan bulanan."
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLocationModal(true)}
            className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <MapPin size={16} className="text-blue-600" />
            Pengaturan Lokasi
          </button>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* Main Tabs */}
      <div className="flex border-b border-slate-200 font-semibold text-sm">
        <button
          type="button"
          onClick={() => setActiveTab("monitoring")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition ${
            activeTab === "monitoring"
              ? "border-blue-600 font-extrabold text-blue-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users size={17} />
          Monitoring Harian
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("approval")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition ${
            activeTab === "approval"
              ? "border-blue-600 font-extrabold text-blue-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileCheck size={17} />
          Approval Pengajuan
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 transition ${
            activeTab === "reports"
              ? "border-blue-600 font-extrabold text-blue-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <PieChart size={17} />
          Rekap & Laporan
        </button>
      </div>

      {/* TAB 1: MONITORING HARIAN */}
      {activeTab === "monitoring" && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <Users size={22} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Total Team</p>
                  <p className="text-xl font-black text-slate-950">
                    {loading ? "…" : monitoringData?.summary.totalTeam ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <UserCheck size={22} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Hadir Hari Ini</p>
                  <p className="text-xl font-black text-emerald-700">
                    {loading ? "…" : monitoringData?.summary.presentToday ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-red-50 text-red-700">
                  <UserX size={22} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Tidak Hadir Hari Ini</p>
                  <p className="text-xl font-black text-red-700">
                    {loading ? "…" : monitoringData?.summary.absentToday ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("approval")}
              className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-left shadow-sm transition hover:bg-amber-100/60 focus-visible:outline-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
                    <Clock3 size={22} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-amber-900">Pengajuan Menunggu</p>
                    <p className="text-xl font-black text-amber-950">
                      {loading ? "…" : monitoringData?.summary.pendingLeaveCount ?? 0}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-amber-700" />
              </div>
            </button>
          </div>

          {/* Filter Bar & Month Selector */}
          <AppCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Bulan Sebelumnya"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                  <Calendar size={17} className="text-blue-600" />
                  <input
                    type="month"
                    className={`${nextgenControlClass} font-bold`}
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Bulan Selanjutnya"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Cari nama team…"
                  className={`${nextgenControlClass} w-48 sm:w-64`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className={nextgenControlClass}
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                >
                  <option value="">Semua Divisi</option>
                  <option value="SALES">SALES</option>
                  <option value="DRIVER">DRIVER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="OPERATIONAL">OPERATIONAL</option>
                </select>
              </div>
            </div>
          </AppCard>

          {/* Matrix Container & Side Panel */}
          <div className="grid gap-5 xl:grid-cols-4">
            <div className="xl:col-span-3">
              <AppCard className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/90 font-bold text-slate-700">
                        {/* Sticky Left Columns */}
                        <th className="sticky left-0 z-20 w-10 bg-slate-100 px-3 py-3 text-center border-r border-slate-200">
                          No
                        </th>
                        <th className="sticky left-10 z-20 min-w-44 bg-slate-100 px-3 py-3 text-left border-r border-slate-200">
                          Nama Team
                        </th>
                        <th className="sticky left-54 z-20 min-w-28 bg-slate-100 px-3 py-3 text-left border-r border-slate-200">
                          Divisi
                        </th>

                        {/* Day Columns */}
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
                          const dayStr = `${month}-${String(dayNum).padStart(2, "0")}`;
                          const isToday = dayStr === monitoringData?.todayStr;
                          const abbrev = getDayAbbrev(yearNum, monthNum, dayNum);
                          const isSunday = abbrev === "Min";

                          return (
                            <th
                              key={dayNum}
                              className={`min-w-10 px-1 py-2 text-center border-r border-slate-200/70 ${
                                isToday
                                  ? "bg-blue-100 text-blue-900 font-black"
                                  : isSunday
                                  ? "bg-red-50 text-red-600"
                                  : ""
                              }`}
                            >
                              <div className="font-extrabold">{dayNum}</div>
                              <div className="text-[10px] opacity-75">{abbrev}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={daysInMonth + 3} className="p-8 text-center text-slate-500 font-semibold">
                            Memuat matrix kehadiran…
                          </td>
                        </tr>
                      ) : !monitoringData || monitoringData.employees.length === 0 ? (
                        <tr>
                          <td colSpan={daysInMonth + 3} className="p-8 text-center text-slate-500 font-semibold">
                            Belum ada team terdaftar di outlet ini.
                          </td>
                        </tr>
                      ) : (
                        monitoringData.employees.map((emp, idx) => (
                          <tr key={emp.id} className="border-t border-slate-200/80 hover:bg-slate-50/80">
                            {/* Sticky Left Row Values */}
                            <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-center font-bold text-slate-500 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="sticky left-10 z-10 bg-white px-3 py-2.5 font-extrabold text-slate-900 truncate border-r border-slate-200">
                              {emp.name}
                            </td>
                            <td className="sticky left-54 z-10 bg-white px-3 py-2.5 font-semibold text-slate-600 truncate border-r border-slate-200">
                              {emp.division}
                            </td>

                            {/* Matrix Day Cells */}
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
                              const dayStr = `${month}-${String(dayNum).padStart(2, "0")}`;
                              const cell = emp.days[dayStr] ?? { status: "OFF" };
                              const isToday = dayStr === monitoringData.todayStr;

                              return (
                                <td
                                  key={dayNum}
                                  className={`px-0.5 py-1.5 text-center border-r border-slate-200/70 ${
                                    isToday ? "bg-blue-50/50" : ""
                                  }`}
                                >
                                  <MatrixCell
                                    cell={cell}
                                    onClick={() =>
                                      setSelectedCell({
                                        employeeName: emp.name,
                                        date: dayStr,
                                        cell,
                                      })
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Legend Bar */}
                <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-700">
                  <span className="font-extrabold text-slate-900">Keterangan:</span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-grid size-5 place-items-center rounded bg-emerald-100 font-bold text-emerald-800">
                      ✓
                    </span>{" "}
                    Hadir
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-grid size-5 place-items-center rounded bg-red-100 font-bold text-red-800">
                      ✕
                    </span>{" "}
                    Tidak Hadir / Mangkir
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-grid size-5 place-items-center rounded bg-amber-100 font-bold text-amber-800">
                      I
                    </span>{" "}
                    Izin
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-grid size-5 place-items-center rounded bg-purple-100 font-bold text-purple-800">
                      S
                    </span>{" "}
                    Sakit
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-grid size-5 place-items-center rounded bg-blue-100 font-bold text-blue-800">
                      C
                    </span>{" "}
                    Cuti
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-grid size-5 place-items-center rounded bg-slate-200 font-bold text-slate-600">
                      -
                    </span>{" "}
                    Libur / Future
                  </span>
                </div>
              </AppCard>
            </div>

            {/* Compact Right Side Approval Panel (for Desktop) */}
            <div className="space-y-4">
              <AppCard className="p-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-extrabold text-slate-950 flex items-center gap-2">
                    <Clock3 size={17} className="text-amber-600" />
                    Approval Pending
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("approval")}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Lihat Semua
                  </button>
                </div>

                {loading ? (
                  <p className="mt-4 text-center text-xs text-slate-500">Memuat approval…</p>
                ) : !monitoringData || monitoringData.pendingSummary.length === 0 ? (
                  <div className="mt-4 text-center py-4">
                    <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
                    <p className="mt-1.5 text-xs font-bold text-slate-700">Semua pengajuan tuntas</p>
                    <p className="text-[11px] text-slate-400">Tidak ada pengajuan pending saat ini.</p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {monitoringData.pendingSummary.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <p className="font-extrabold text-slate-900">{item.employeeName}</p>
                            <p className="text-[11px] text-slate-500 font-semibold">{item.division}</p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                              item.type === "PERMISSION"
                                ? "bg-amber-100 text-amber-800"
                                : item.type === "SICK"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {item.type === "PERMISSION" ? "IZIN" : item.type === "SICK" ? "SAKIT" : "CUTI"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-semibold">
                          {formatDateId(item.startDate)} - {formatDateId(item.endDate)}
                        </p>
                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => void handleApprove(item.id)}
                            className="flex-1 rounded-lg bg-emerald-600 py-1.5 font-bold text-white hover:bg-emerald-700 text-center text-[11px]"
                          >
                            Setujui
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => void handleReject(item.id)}
                            className="flex-1 rounded-lg bg-red-600 py-1.5 font-bold text-white hover:bg-red-700 text-center text-[11px]"
                          >
                            Tolak
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AppCard>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: APPROVAL PENGAJUAN */}
      {activeTab === "approval" && (
        <div className="space-y-4">
          <AppCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter size={17} className="text-slate-500" />
                <span className="text-sm font-extrabold text-slate-800">Filter Pengajuan:</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className={nextgenControlClass}
                  value={approvalStatusFilter}
                  onChange={(e) => setApprovalStatusFilter(e.target.value)}
                >
                  <option value="PENDING">PENDING (Menunggu Approval)</option>
                  <option value="APPROVED">APPROVED (Disetujui)</option>
                  <option value="REJECTED">REJECTED (Ditolak)</option>
                  <option value="CANCELLED">CANCELLED (Dibatalkan)</option>
                </select>

                <select
                  className={nextgenControlClass}
                  value={approvalTypeFilter}
                  onChange={(e) => setApprovalTypeFilter(e.target.value)}
                >
                  <option value="">Semua Jenis</option>
                  <option value="LEAVE">CUTI</option>
                  <option value="PERMISSION">IZIN</option>
                  <option value="SICK">SAKIT</option>
                </select>
              </div>
            </div>
          </AppCard>

          <AppCard className="p-5">
            <h2 className="text-base font-extrabold text-slate-950 mb-4">
              Daftar Pengajuan ({approvals.length})
            </h2>

            {loading ? (
              <div className="py-8 text-center text-sm font-semibold text-slate-500">
                Memuat daftar pengajuan…
              </div>
            ) : approvals.length === 0 ? (
              <div className="py-12 text-center">
                <FileCheck size={36} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-extrabold text-slate-800">Tidak ada pengajuan pada filter ini</p>
                <p className="mt-1 text-xs text-slate-500">
                  Pengajuan izin, sakit, atau cuti dari Team akan muncul di sini.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {approvals.map((item) => {
                  const duration = calculateDaysDuration(item.startDate, item.endDate);
                  const isPending = item.status === "PENDING";
                  const empName = item.employee?.name || item.employeeName || "Karyawan";
                  const empDivision = item.employee?.division || item.division || "-";
                  const empInitial = (empName.trim() ? empName.trim().charAt(0) : "K").toUpperCase();
                  const reviewerName = item.reviewer?.name || null;

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700 font-black text-sm">
                            {empInitial}
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-950">{empName}</h3>
                            <p className="text-xs font-semibold text-slate-500">{empDivision}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              item.type === "PERMISSION"
                                ? "bg-amber-100 text-amber-900 border border-amber-200"
                                : item.type === "SICK"
                                ? "bg-purple-100 text-purple-900 border border-purple-200"
                                : "bg-blue-100 text-blue-900 border border-blue-200"
                            }`}
                          >
                            {item.type === "PERMISSION" ? "IZIN" : item.type === "SICK" ? "SAKIT" : "CUTI"}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              item.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "REJECTED"
                                ? "bg-red-100 text-red-800"
                                : item.status === "PENDING"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {item.status ?? "PENDING"}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-xl bg-slate-50 p-3.5 text-xs sm:grid-cols-3 font-semibold text-slate-700">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Tanggal Mulai - Selesai</span>
                          <span className="font-extrabold text-slate-900">
                            {formatDateId(item.startDate)} - {formatDateId(item.endDate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Durasi</span>
                          <span className="font-extrabold text-slate-900">{duration} Hari</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Diajukan Pada</span>
                          <span className="font-extrabold text-slate-900">{formatTime(item.submittedAt)}</span>
                        </div>
                      </div>

                      <div className="text-xs">
                        <span className="font-bold text-slate-500">Alasan: </span>
                        <span className="font-semibold text-slate-800">{item.reason || "-"}</span>
                      </div>

                      {reviewerName && (
                        <div className="text-xs text-slate-600 bg-slate-100 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-bold">Direview oleh: </span>
                            <span>{reviewerName}</span>
                          </div>
                          {item.reviewedAt && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              {formatTime(item.reviewedAt)}
                            </span>
                          )}
                        </div>
                      )}

                      {item.reviewNotes && (
                        <div className="text-xs text-slate-600 bg-slate-100 p-2.5 rounded-xl">
                          <span className="font-bold">Catatan Reviewer: </span>
                          <span>{item.reviewNotes}</span>
                        </div>
                      )}

                      {isPending && (
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                          <input
                            type="text"
                            placeholder="Catatan persetujuan/penolakan (opsional)…"
                            className={`${nextgenControlClass} text-xs flex-1 min-w-48`}
                            value={actionNotes[item.id] || ""}
                            onChange={(e) =>
                              setActionNotes({ ...actionNotes, [item.id]: e.target.value })
                            }
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => void handleApprove(item.id)}
                              className={`${nextgenButtonClass} bg-emerald-600 text-white hover:bg-emerald-700`}
                            >
                              <Check size={16} /> Setujui
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => void handleReject(item.id)}
                              className={`${nextgenButtonClass} bg-red-600 text-white hover:bg-red-700`}
                            >
                              <X size={16} /> Tolak
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AppCard>
        </div>
      )}

      {/* TAB 3: REKAP & LAPORAN */}
      {activeTab === "reports" && (
        <div className="space-y-5">
          {/* Summary Cards Header */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <Users size={22} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Total Team</p>
                  <p className="text-xl font-black text-slate-950">
                    {loading ? "…" : reportData?.summary.totalTeam ?? 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <PieChart size={22} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Rata-rata Kehadiran</p>
                  <p className="text-xl font-black text-emerald-700">
                    {loading ? "…" : `${reportData?.summary.averageRate.toFixed(2) ?? 0}%`}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-red-50 text-red-700">
                  <UserX size={22} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Total Tidak Hadir</p>
                  <p className="text-xl font-black text-red-700">
                    {loading ? "…" : reportData?.summary.totalAbsent ?? 0} hari
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-800">
                  <Clock3 size={22} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Total Izin / Sakit / Cuti</p>
                  <p className="text-xl font-black text-amber-900">
                    {loading ? "…" : reportData?.summary.totalLeaves ?? 0} hari
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar & Export Excel */}
          <AppCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Bulan Sebelumnya"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex items-center gap-2">
                  <Calendar size={17} className="text-blue-600" />
                  <input
                    type="month"
                    className={`${nextgenControlClass} font-bold`}
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Bulan Selanjutnya"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Cari nama team…"
                  className={`${nextgenControlClass} w-48 sm:w-64`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className={nextgenControlClass}
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                >
                  <option value="">Semua Divisi</option>
                  <option value="SALES">SALES</option>
                  <option value="DRIVER">DRIVER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="OPERATIONAL">OPERATIONAL</option>
                </select>

                <button
                  type="button"
                  disabled={exporting || loading}
                  onClick={() => void handleExportExcel()}
                  className={`${nextgenButtonClass} bg-emerald-600 text-white hover:bg-emerald-700`}
                >
                  <FileSpreadsheet size={16} />
                  {exporting ? "Mengunduh Excel…" : "Download Excel"}
                </button>
              </div>
            </div>
          </AppCard>

          {/* Table Rekap */}
          <AppCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 font-bold text-slate-700">
                    <th className="sticky left-0 z-20 min-w-44 bg-slate-100 px-4 py-3.5 text-left border-r border-slate-200">
                      Nama Team
                    </th>
                    <th className="sticky left-44 z-20 min-w-28 bg-slate-100 px-4 py-3.5 text-left border-r border-slate-200">
                      Divisi
                    </th>
                    <th className="px-3 py-3.5 text-center border-r border-slate-200">Hadir</th>
                    <th className="px-3 py-3.5 text-center border-r border-slate-200">Terlambat</th>
                    <th className="px-3 py-3.5 text-center border-r border-slate-200">Izin</th>
                    <th className="px-3 py-3.5 text-center border-r border-slate-200">Sakit</th>
                    <th className="px-3 py-3.5 text-center border-r border-slate-200">Cuti</th>
                    <th className="px-3 py-3.5 text-center border-r border-slate-200">Tidak Hadir</th>
                    <th className="px-4 py-3.5 text-center">Persentase Kehadiran</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 font-semibold">
                        Memuat rekap absensi…
                      </td>
                    </tr>
                  ) : !reportData || reportData.employees.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 font-semibold">
                        Belum ada data rekap untuk periode ini.
                      </td>
                    </tr>
                  ) : (
                    reportData.employees.map((emp) => (
                      <tr
                        key={emp.id}
                        onClick={() => setSelectedReportEmp(emp)}
                        className="border-t border-slate-200/80 hover:bg-blue-50/60 cursor-pointer transition"
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 font-extrabold text-slate-900 truncate border-r border-slate-200">
                          {emp.name}
                        </td>
                        <td className="sticky left-44 z-10 bg-white px-4 py-3 font-semibold text-slate-600 truncate border-r border-slate-200">
                          {emp.division}
                        </td>
                        <td className="px-3 py-3 text-center font-extrabold text-emerald-700 border-r border-slate-200">
                          {emp.presentDays}
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-amber-700 border-r border-slate-200">
                          {emp.lateDays}
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-slate-700 border-r border-slate-200">
                          {emp.permissionDays}
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-slate-700 border-r border-slate-200">
                          {emp.sickDays}
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-slate-700 border-r border-slate-200">
                          {emp.leaveDays}
                        </td>
                        <td className="px-3 py-3 text-center font-extrabold text-red-700 border-r border-slate-200">
                          {emp.absentDays}
                        </td>
                        <td className="px-4 py-3 text-center font-black">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs ${
                              emp.attendanceRate >= 90
                                ? "bg-emerald-100 text-emerald-900"
                                : emp.attendanceRate >= 75
                                ? "bg-amber-100 text-amber-900"
                                : "bg-red-100 text-red-900"
                            }`}
                          >
                            {emp.attendanceRate.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-400 font-semibold text-right">
              Klik pada baris employee untuk melihat rincian tanggal kehadiran.
            </div>
          </AppCard>
        </div>
      )}

      {/* Modal: Employee Report Detail Breakdown */}
      {selectedReportEmp && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-950">
                  Rincian Kehadiran — {selectedReportEmp.name}
                </h2>
                <p className="text-xs text-slate-500 font-semibold">
                  Divisi: {selectedReportEmp.division} · Persentase: {selectedReportEmp.attendanceRate.toFixed(2)}%
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReportEmp(null)}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                  <tr>
                    <th className="p-3">Tanggal</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Jam Masuk</th>
                    <th className="p-3">Jam Pulang</th>
                    <th className="p-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedReportEmp.dailyBreakdown.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50">
                      <td className="p-3 font-extrabold text-slate-900">{formatDateId(row.date)}</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                            row.status === "PRESENT"
                              ? "bg-emerald-100 text-emerald-800"
                              : row.status === "ABSENT"
                              ? "bg-red-100 text-red-800"
                              : row.status === "PERMISSION"
                              ? "bg-amber-100 text-amber-800"
                              : row.status === "SICK"
                              ? "bg-purple-100 text-purple-800"
                              : row.status === "LEAVE"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-700">{formatTime(row.checkInAt)}</td>
                      <td className="p-3 font-semibold text-slate-700">{formatTime(row.checkOutAt)}</td>
                      <td className="p-3 text-slate-600">{row.leaveReason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                className={`${nextgenButtonClass} bg-slate-900 text-white`}
                onClick={() => setSelectedReportEmp(null)}
              >
                Tutup
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Detail Cell Attendance */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-950">
                Detail Kehadiran — {selectedCell.employeeName}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Tanggal:</span>
                <span className="font-extrabold text-slate-900">{formatDateId(selectedCell.date)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-500">Status Kehadiran:</span>
                <span className="font-black px-2.5 py-0.5 rounded-full text-xs bg-slate-100">
                  {selectedCell.cell.status}
                </span>
              </div>

              {selectedCell.cell.status === "PRESENT" && (
                <>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500">Jam Masuk:</span>
                    <span className="font-bold text-slate-900">{formatTime(selectedCell.cell.checkInAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500">Jam Pulang:</span>
                    <span className="font-bold text-slate-900">{formatTime(selectedCell.cell.checkOutAt)}</span>
                  </div>
                </>
              )}

              {selectedCell.cell.leaveReason && (
                <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
                  <span className="font-bold block mb-1">Alasan Pengajuan:</span>
                  <span>{selectedCell.cell.leaveReason}</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                className={`${nextgenButtonClass} bg-slate-900 text-white`}
                onClick={() => setSelectedCell(null)}
              >
                Tutup
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Pengaturan Lokasi Absensi */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-950">Pengaturan Lokasi Absensi</h2>
                <p className="text-xs text-slate-500">
                  {location ? `${location.outlet.code} · ${location.outlet.name}` : "Memuat outlet…"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                <span className="mb-1 block">Latitude</span>
                <input
                  disabled={!canCorrect}
                  className={`${nextgenControlClass} w-full text-xs`}
                  type="number"
                  step="any"
                  value={locationForm.latitude}
                  onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                <span className="mb-1 block">Longitude</span>
                <input
                  disabled={!canCorrect}
                  className={`${nextgenControlClass} w-full text-xs`}
                  type="number"
                  step="any"
                  value={locationForm.longitude}
                  onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                <span className="mb-1 block">Radius Meter</span>
                <input
                  disabled={!canCorrect}
                  className={`${nextgenControlClass} w-full text-xs`}
                  type="number"
                  min="1"
                  max="10000"
                  value={locationForm.radiusMeters}
                  onChange={(e) => setLocationForm({ ...locationForm, radiusMeters: e.target.value })}
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                <span className="mb-1 block">Status Lokasi</span>
                <label className="flex h-10 items-center gap-2">
                  <input
                    disabled={!canCorrect}
                    type="checkbox"
                    checked={locationForm.isActive}
                    onChange={(e) => setLocationForm({ ...locationForm, isActive: e.target.checked })}
                  />
                  <span>Lokasi Aktif</span>
                </label>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
              {canCorrect ? (
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 text-xs`}
                >
                  <LocateFixed size={15} /> Gunakan Lokasi GPS Saat Ini
                </button>
              ) : (
                <span />
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 text-xs`}
                  onClick={() => setShowLocationModal(false)}
                >
                  Batal
                </button>
                {canCorrect && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void handleSaveLocation()}
                    className={`${nextgenButtonClass} bg-blue-600 text-white text-xs`}
                  >
                    <Save size={15} /> {actionLoading ? "Menyimpan…" : "Simpan Lokasi"}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MatrixCell({ cell, onClick }: { cell: DayCell; onClick: () => void }) {
  if (cell.status === "PRESENT") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex size-7 items-center justify-center rounded-lg bg-emerald-100 font-black text-emerald-800 hover:bg-emerald-200 transition"
        title="Hadir (Klik untuk detail)"
      >
        ✓
      </button>
    );
  }
  if (cell.status === "ABSENT") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex size-7 items-center justify-center rounded-lg bg-red-100 font-black text-red-800 hover:bg-red-200 transition"
        title="Tidak Hadir / Mangkir"
      >
        ✕
      </button>
    );
  }
  if (cell.status === "PERMISSION") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex size-7 items-center justify-center rounded-lg bg-amber-100 font-black text-amber-800 hover:bg-amber-200 transition"
        title="Izin"
      >
        I
      </button>
    );
  }
  if (cell.status === "SICK") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex size-7 items-center justify-center rounded-lg bg-purple-100 font-black text-purple-800 hover:bg-purple-200 transition"
        title="Sakit"
      >
        S
      </button>
    );
  }
  if (cell.status === "LEAVE") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex size-7 items-center justify-center rounded-lg bg-blue-100 font-black text-blue-800 hover:bg-blue-200 transition"
        title="Cuti"
      >
        C
      </button>
    );
  }
  return (
    <span className="mx-auto flex size-7 items-center justify-center rounded text-slate-300 font-bold">
      -
    </span>
  );
}

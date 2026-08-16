"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  BarChart3,
  Banknote,
  CalendarDays,
  CircleAlert,
  CircleArrowDown,
  CircleArrowUp,
  CircleCheckBig,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gauge,
  Hourglass,
  Landmark,
  PackageSearch,
  QrCode,
  ReceiptText,
  RefreshCw,
  Scale,
  TriangleAlert,
  Truck,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  DashboardOverview,
  DashboardSection,
} from "@/modules/dashboard";
import {
  AppCard,
  EmptyState,
  nextgenButtonClass,
  nextgenControlClass,
} from "@/components/ui";

const money = (value: string | number) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format(Number(value));
const number = (value: string | number, digits = 0) => new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: digits,
}).format(Number(value));
const percent = (value: number) => `${number(value, 2)}%`;
const labelDate = (value: string) => new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
}).format(new Date(`${value}T00:00:00.000Z`));
const fullDate = (value: string) => new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${value}T00:00:00.000Z`));
const jakartaToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const monthRange = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return {
    startDate: `${date.slice(0, 7)}-01`,
    endDate: `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`,
  };
};
const shiftMonth = (date: string, offset: number) => {
  const parsed = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + offset);
  return monthRange(parsed.toISOString().slice(0, 10));
};

type Series = { key: string; label: string; color: string };

function DashboardChart({
  rows,
  series,
  kind = "number",
  target,
  variant = "line",
  compact = false,
  reducedMotion = false,
}: {
  rows: Array<Record<string, string | number>>;
  series: Series[];
  kind?: "number" | "money" | "percent" | "weight";
  target?: number;
  variant?: "line" | "bar";
  compact?: boolean;
  reducedMotion?: boolean;
}) {
  if (rows.length === 0) return <EmptyChart />;
  const format = (value: unknown) => {
    const parsed = Number(value);
    if (kind === "money") return money(parsed);
    if (kind === "percent") return percent(parsed);
    if (kind === "weight") return `${number(parsed, 2)} kg`;
    return number(parsed);
  };
  return (
    <div className={compact ? "h-44 w-full" : "h-64 w-full lg:h-[19rem]"}>
      <ResponsiveContainer width="100%" height="100%">
        {variant === "bar" ? (
          <BarChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 2 }} barGap={4}>
            <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="var(--nextgen-border)" />
            <XAxis dataKey="date" tickFormatter={labelDate} tick={{ fontSize: 11, fill: "var(--nextgen-text-secondary)" }} />
            <YAxis tickFormatter={(value) => kind === "money" ? `${Math.round(Number(value) / 1000)}k` : number(value)} tick={{ fontSize: 11, fill: "var(--nextgen-text-muted)" }} />
            <Tooltip formatter={(value, name) => [format(value), name]} labelFormatter={(value) => fullDate(String(value))} cursor={{ fill: "var(--nextgen-primary-soft)" }} />
            <Legend />
            {series.map((item) => (
              <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={!reducedMotion} animationDuration={700} animationEasing="ease-out" />
            ))}
            {target !== undefined && (
              <ReferenceLine y={target} name={`Target ${percent(target)}`} stroke="var(--nextgen-text-muted)" strokeDasharray="6 5" />
            )}
          </BarChart>
        ) : (
          <LineChart data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 2 }}>
            <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="var(--nextgen-border)" />
            <XAxis dataKey="date" tickFormatter={labelDate} tick={{ fontSize: 11, fill: "var(--nextgen-text-secondary)" }} />
            <YAxis tickFormatter={(value) => kind === "money" ? `${Math.round(Number(value) / 1000)}k` : number(value)} tick={{ fontSize: 11, fill: "var(--nextgen-text-muted)" }} />
            <Tooltip formatter={(value, name) => [format(value), name]} labelFormatter={(value) => fullDate(String(value))} />
            <Legend />
            {series.map((item) => (
              <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2.5} dot={false} isAnimationActive={!reducedMotion} animationDuration={700} animationEasing="ease-out" />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function Donut({
  value,
  remaining,
  valueLabel,
  remainingLabel,
  center,
  colors = ["var(--nextgen-success)", "var(--nextgen-border)"],
  reducedMotion = false,
}: {
  value: number;
  remaining: number;
  valueLabel: string;
  remainingLabel: string;
  center: string;
  colors?: [string, string];
  reducedMotion?: boolean;
}) {
  const data = [
    { name: valueLabel, value: Math.max(0, value), fill: colors[0] },
    { name: remainingLabel, value: Math.max(0, remaining), fill: colors[1] },
  ];
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="relative h-44 w-full rounded-[var(--nextgen-radius-inner)] bg-slate-50/70 ring-1 ring-inset ring-[var(--nextgen-border)]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={70} paddingAngle={2} stroke="none" isAnimationActive={!reducedMotion} animationDuration={750} animationEasing="ease-out" />
          <Tooltip formatter={(item) => {
            const numeric = Number(item);
            const share = total > 0 ? numeric / total * 100 : 0;
            return `${number(numeric, 2)} (${percent(share)})`;
          }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="rounded-full bg-[var(--nextgen-card)] px-3 py-1.5 text-xl font-bold tracking-tight text-slate-900 shadow-sm ring-1 ring-[var(--nextgen-border)]">{center}</span>
      </div>
    </div>
  );
}

const metricToneClasses = {
  blue: "bg-[var(--nextgen-primary-soft)] text-[var(--nextgen-primary)]",
  emerald: "bg-[var(--nextgen-success-soft)] text-[var(--nextgen-success)]",
  amber: "bg-[var(--nextgen-warning-soft)] text-[var(--nextgen-warning)]",
  red: "bg-[var(--nextgen-danger-soft)] text-[var(--nextgen-danger)]",
  slate: "bg-slate-100 text-slate-700",
  violet: "bg-[var(--nextgen-purple-soft)] text-[var(--nextgen-purple)]",
} as const;

function DashboardMetricCard({
  label,
  value,
  note,
  noteTone = "muted",
  icon: Icon,
  tone = "blue",
  index = 0,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  noteTone?: "muted" | "warning";
  icon: LucideIcon;
  tone?: keyof typeof metricToneClasses;
  index?: number;
}) {
  return (
    <AppCard
      className="dashboard-metric-card flex h-auto min-h-28 min-w-0 flex-col rounded-[var(--nextgen-radius-inner)] border-[var(--nextgen-border)] p-4 shadow-none transition duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-blue-200 motion-safe:hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)] motion-reduce:transform-none motion-reduce:transition-none"
      style={{ "--dashboard-delay": `${Math.min(index, 8) * 45}ms` } as CSSProperties}
    >
      <span className={`grid size-10 place-items-center rounded-[var(--nextgen-radius-control)] ring-1 ring-inset ring-black/[0.03] ${metricToneClasses[tone]}`} aria-hidden="true">
        <Icon size={19} strokeWidth={2} />
      </span>
      <p className="mt-3 text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 break-words text-xl font-bold tracking-tight text-[var(--nextgen-text-primary)] 2xl:text-2xl">{value}</p>
      {note && (
        <p className={`mt-auto pt-1.5 text-xs ${noteTone === "warning" ? "text-[var(--nextgen-danger)]" : "text-slate-500"}`}>
          {note}
        </p>
      )}
    </AppCard>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-72 place-items-center rounded-xl border border-dashed border-[var(--nextgen-border)] bg-slate-50/70 px-6 text-center text-sm text-[var(--nextgen-text-secondary)]">
      <div>
        <EmptyState kind="monitoring" label="Belum ada histori pada periode ini" className="mx-auto max-w-48" />
        <p className="mt-2">Belum ada histori pada periode ini.</p>
      </div>
    </div>
  );
}

const sectionToneClasses = {
  blue: "bg-[var(--nextgen-primary-soft)] text-[var(--nextgen-primary)]",
  emerald: "bg-[var(--nextgen-success-soft)] text-[var(--nextgen-success)]",
  amber: "bg-[var(--nextgen-warning-soft)] text-[var(--nextgen-warning)]",
  red: "bg-[var(--nextgen-danger-soft)] text-[var(--nextgen-danger)]",
  violet: "bg-[var(--nextgen-purple-soft)] text-[var(--nextgen-purple)]",
} as const;

function SectionFrame({
  title,
  href,
  description,
  section,
  icon: Icon,
  tone = "blue",
  children,
  className = "",
}: {
  title: string;
  href: string;
  description: string;
  section: DashboardSection<unknown>;
  icon: LucideIcon;
  tone?: keyof typeof sectionToneClasses;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AppCard className={`section-frame h-full min-h-0 min-w-0 overflow-visible rounded-[var(--nextgen-radius-panel)] border-[var(--nextgen-border)] p-4 shadow-[0_10px_35px_rgba(15,23,42,0.045)] transition duration-300 motion-safe:hover:-translate-y-px motion-safe:hover:border-slate-300 motion-safe:hover:shadow-[0_16px_42px_rgba(15,23,42,0.075)] motion-reduce:transform-none motion-reduce:transition-none sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--nextgen-border)] pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-[var(--nextgen-radius-control)] ring-1 ring-inset ring-black/[0.03] ${sectionToneClasses[tone]}`} aria-hidden="true">
            <Icon size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-[var(--nextgen-text-primary)] lg:text-lg">{title}</h2>
            <p className="mt-1 text-xs text-[var(--nextgen-text-secondary)] lg:text-sm">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-lg border border-blue-100 bg-[var(--nextgen-primary-soft)] px-2.5 text-xs font-bold text-[var(--nextgen-primary)] outline-none transition hover:border-blue-200 hover:bg-blue-100/70 hover:text-[var(--nextgen-primary-hover)] focus-visible:ring-2 focus-visible:ring-blue-200">
            Lihat Detail <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          {section.status === "success" && section.updatedAt && (
            <p className="mt-1 text-[11px] text-slate-400">
              Sync {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(section.updatedAt))}
            </p>
          )}
        </div>
      </div>
      {section.status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-[var(--nextgen-danger-soft)] p-5 text-sm text-[var(--nextgen-danger)]">
          {section.error.message} Section lain tetap dapat digunakan.
        </div>
      ) : children}
    </AppCard>
  );
}

function MonitoringKpi({
  label,
  value,
  note,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon: LucideIcon;
  tone: keyof typeof metricToneClasses;
  index: number;
}) {
  return (
    <div
      className="dashboard-metric-card group relative flex min-h-[132px] min-w-0 flex-col overflow-hidden rounded-[var(--nextgen-radius-inner)] border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] p-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_34px_rgba(15,23,42,0.07)] motion-reduce:transform-none"
      style={{ "--dashboard-delay": `${index * 45}ms` } as CSSProperties}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[var(--nextgen-primary)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 pt-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">{label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-[var(--nextgen-radius-control)] ring-1 ring-inset ring-black/[0.03] transition-transform motion-safe:group-hover:scale-105 ${metricToneClasses[tone]}`} aria-hidden="true">
          <Icon size={17} strokeWidth={2} />
        </span>
      </div>
      <div className="mt-auto min-w-0 pt-3">
        <p className="truncate text-2xl font-bold tracking-[-0.025em] text-[var(--nextgen-text-primary)]">{value}</p>
        <p className="mt-1.5 truncate text-[11px] font-medium text-slate-400">{note}</p>
      </div>
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6" aria-label="Memuat dashboard">
      {[1, 2, 3].map((section) => (
        <div key={section} className="space-y-3">
          <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-200/70" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardOverviewClient({
  initialStartDate,
  initialEndDate,
  outletCode,
}: {
  initialStartDate: string;
  initialEndDate: string;
  outletCode: string | null;
}) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [refreshKey, setRefreshKey] = useState(0);
  const [presentationKey, setPresentationKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [result, setResult] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [monitoringChart, setMonitoringChart] = useState("achievement");
  const rangeDays = useMemo(() => {
    if (!startDate || !endDate) return Number.POSITIVE_INFINITY;
    return (dateValue(endDate) - dateValue(startDate)) / 86_400_000 + 1;
  }, [endDate, startDate]);
  const validRange = startDate <= endDate && rangeDays <= 366;

  const load = useCallback(async () => {
    if (!validRange) return;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ startDate, endDate, _: String(refreshKey) });
      const response = await fetch(`/api/dashboard/overview?${query}`, { cache: "no-store" });
      const payload = await response.json() as DashboardOverview & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Dashboard belum dapat dimuat.");
      setResult(payload);
      setPresentationKey((value) => value + 1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dashboard belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [endDate, refreshKey, startDate, validRange]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener("change", updateMotionPreference);
    return () => media.removeEventListener("change", updateMotionPreference);
  }, []);

  function applyPeriod(period: { startDate: string; endDate: string }) {
    setStartDate(period.startDate);
    setEndDate(period.endDate);
  }

  const monitoring = result?.monitoring.status === "success" ? result.monitoring.data : null;
  const delivery = result?.deliverySettlement.status === "success" ? result.deliverySettlement.data : null;
  const operational = result?.operationalSettlement.status === "success" ? result.operationalSettlement.data : null;
  const payment = result?.paymentSettlement.status === "success" ? result.paymentSettlement.data : null;
  const pickup = result?.pickupPayment.status === "success" ? result.pickupPayment.data : null;
  const sla = result?.sla.status === "success" ? result.sla.data : null;
  const stuck = result?.stuckDelivery.status === "success" ? result.stuckDelivery.data : null;
  const monitoringRows = monitoring?.daily.map((row) => ({
    ...row,
    pickupRevenue: Number(row.pickupRevenue),
    pickupWeight: Number(row.pickupWeight),
  })) ?? [];
  const monitoringCharts = {
    achievement: { label: "Achievement Delivery", series: [{ key: "achievement", label: "Achievement", color: "var(--nextgen-success)" }], kind: "percent" as const, target: monitoring?.target },
    ttd: { label: "TTD vs Pending", series: [{ key: "totalTtd", label: "Total TTD", color: "var(--nextgen-primary)" }, { key: "pending", label: "Pending", color: "var(--nextgen-danger)" }], kind: "number" as const },
    revenue: { label: "Pickup Omset Harian", series: [{ key: "pickupRevenue", label: "Pickup Omset", color: "var(--nextgen-primary-hover)" }], kind: "money" as const },
    weight: { label: "Berat Pickup Harian", series: [{ key: "pickupWeight", label: "Berat Pickup", color: "var(--nextgen-warning)" }], kind: "weight" as const },
  };
  const activeMonitoringChart = monitoringCharts[monitoringChart as keyof typeof monitoringCharts];
  const pendingWithinTarget = monitoring?.pendingMaximum != null && monitoring.summary.totalPending <= monitoring.pendingMaximum;
  const pickupRevenueWithinTarget = monitoring?.pickupRevenueTarget != null && Number(monitoring.summary.pickupRevenue) >= monitoring.pickupRevenueTarget;
  const pickupWeightWithinTarget = monitoring?.pickupWeightTarget != null && Number(monitoring.summary.pickupWeight) >= monitoring.pickupWeightTarget;
  const stuckWithinTarget = stuck?.waybillStuckMaximum != null && stuck.totalInventory <= stuck.waybillStuckMaximum;

  return (
    <div className="dashboard-workspace mx-auto min-w-0 max-w-[1800px] space-y-5 overflow-x-clip rounded-[var(--nextgen-radius-workspace)] bg-white/35 p-1 sm:p-1.5">
      <header className="nextgen-dashboard-pattern relative overflow-hidden rounded-[calc(var(--nextgen-radius-workspace)+2px)] border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] p-5 shadow-[0_16px_48px_rgba(15,23,42,0.065)] sm:p-6">
        <span className="absolute inset-y-0 left-0 w-1 bg-[var(--nextgen-primary)]" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-5 min-[1400px]:flex-row min-[1400px]:items-center min-[1400px]:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-px w-7 bg-[var(--nextgen-primary)]" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--nextgen-primary)]">Operational Executive Dashboard</p>
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--nextgen-text-primary)] sm:whitespace-nowrap sm:text-[28px]">Dashboard Operasional</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-5 text-[var(--nextgen-text-secondary)]">Mirror read-only seluruh operasional <strong className="font-bold text-slate-700">{outletCode ?? "outlet aktif"}</strong>.</p>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2 min-[1400px]:items-end">
          <div className="dashboard-toolbar flex w-full flex-wrap items-center gap-2 rounded-[var(--nextgen-radius-inner)] border border-[var(--nextgen-border)] bg-slate-50/80 p-1.5 shadow-inner shadow-slate-950/[0.02] xl:w-auto xl:flex-nowrap">
            <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] px-3 py-1 shadow-sm sm:w-auto sm:min-w-[340px] sm:flex-none">
              <CalendarDays size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
              <input aria-label="Tanggal Awal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={`${nextgenControlClass} dashboard-date-input min-w-0 whitespace-nowrap border-0 bg-transparent px-1 font-medium leading-none shadow-none focus:ring-0`} />
              <span className="px-0.5 text-center text-slate-300">–</span>
              <input aria-label="Tanggal Akhir" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={`${nextgenControlClass} dashboard-date-input min-w-0 whitespace-nowrap border-0 bg-transparent px-1 font-medium leading-none shadow-none focus:ring-0`} />
            </div>
            <button type="button" onClick={() => applyPeriod({ startDate: jakartaToday(), endDate: jakartaToday() })} className={nextgenButtonClass + " border border-transparent bg-transparent text-slate-600 hover:border-[var(--nextgen-border)] hover:bg-[var(--nextgen-card)]"}>Hari Ini</button>
            <button type="button" onClick={() => applyPeriod(monthRange(jakartaToday()))} className={nextgenButtonClass + " border border-transparent bg-transparent text-slate-600 hover:border-[var(--nextgen-border)] hover:bg-[var(--nextgen-card)]"}>Bulan Ini</button>
            <div className="flex overflow-hidden rounded-xl border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] shadow-sm">
            <button type="button" aria-label="Bulan Sebelumnya" onClick={() => applyPeriod(shiftMonth(startDate, -1))} className={nextgenButtonClass + " rounded-none border-0 bg-transparent px-3 text-slate-600 hover:bg-slate-50"}><ChevronLeft size={17} aria-hidden="true" /></button>
            <span className="my-2 w-px bg-[var(--nextgen-border)]" aria-hidden="true" />
            <button type="button" aria-label="Bulan Berikutnya" onClick={() => applyPeriod(shiftMonth(startDate, 1))} className={nextgenButtonClass + " rounded-none border-0 bg-transparent px-3 text-slate-600 hover:bg-slate-50"}><ChevronRight size={17} aria-hidden="true" /></button>
            </div>
            <button type="button" disabled={loading || !validRange} onClick={() => setRefreshKey((value) => value + 1)} className={nextgenButtonClass + " min-w-[104px] bg-[var(--nextgen-primary)] text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)] hover:bg-[var(--nextgen-primary-hover)]"}>
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} aria-hidden="true" /> Refresh
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-500">
            <span>{fullDate(startDate)} – {fullDate(endDate)}</span>
            {result && <><span>·</span><span>Terakhir diperbarui <strong className="text-slate-700">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(result.updatedAt))}</strong></span></>}
          </div>
          {!validRange && <p role="alert" className="text-sm font-medium text-[var(--nextgen-danger)]">Rentang wajib berurutan dan maksimum 366 hari.</p>}
        </div>
        </div>
      </header>

      {error && <AppCard className="border-red-200 bg-[var(--nextgen-danger-soft)] p-4 text-sm text-[var(--nextgen-danger)]">{error}</AppCard>}
      {loading && !result ? <SkeletonDashboard /> : result && (
        <div key={presentationKey} className={loading ? "dashboard-content space-y-5 opacity-70 transition" : "dashboard-content space-y-5 transition"} aria-busy={loading}>
          {monitoring && (
            <AppCard className="border-0 bg-transparent p-0 shadow-none">
              <div className="dashboard-kpi-strip grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <MonitoringKpi label="Achievement Delivery" value={percent(monitoring.summary.achievement)} note={`Target ${percent(monitoring.target)}`} icon={Gauge} tone="emerald" index={0} />
                <MonitoringKpi label="Total TTD" value={number(monitoring.summary.totalTtd)} note="Total tanda tangan" icon={CircleCheckBig} tone="blue" index={1} />
                <MonitoringKpi
                  label="Pending"
                  value={number(monitoring.summary.totalPending)}
                  note={monitoring.pendingMaximum == null ? "Target belum diatur" : `Maksimal ${number(monitoring.pendingMaximum)} paket`}
                  icon={CircleAlert}
                  tone={monitoring.pendingMaximum == null ? "slate" : pendingWithinTarget ? "emerald" : "red"}
                  index={2}
                />
                <MonitoringKpi
                  label="Pickup Omset"
                  value={money(monitoring.summary.pickupRevenue)}
                  note={monitoring.pickupRevenueTarget == null ? "Target belum diatur" : `Target ${money(monitoring.pickupRevenueTarget)}`}
                  icon={Wallet}
                  tone={monitoring.pickupRevenueTarget == null ? "slate" : pickupRevenueWithinTarget ? "emerald" : "amber"}
                  index={3}
                />
                <MonitoringKpi
                  label="Total Berat Pickup"
                  value={`${number(monitoring.summary.pickupWeight, 2)} kg`}
                  note={monitoring.pickupWeightTarget == null ? "Target belum diatur" : `Target ${number(monitoring.pickupWeightTarget, 2)} kg`}
                  icon={Scale}
                  tone={monitoring.pickupWeightTarget == null ? "slate" : pickupWeightWithinTarget ? "emerald" : "amber"}
                  index={4}
                />
              </div>
            </AppCard>
          )}

          <div className="dashboard-analytics-grid grid min-w-0 items-stretch gap-5 md:grid-cols-2">
            <SectionFrame title="Monitoring Performance" description="Mirror Monitoring Daily dan Monthly." href="/dashboard/monitoring/monthly" section={result.monitoring} icon={BarChart3} tone="blue" className="dashboard-monitoring-panel md:col-span-2">
              {monitoring && <>
                <div className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-[var(--nextgen-border)] bg-slate-100/75 p-1 sm:flex-nowrap" role="tablist" aria-label="Metrik Monitoring Performance">
                  {Object.entries(monitoringCharts).map(([key, chart]) => <button key={key} type="button" role="tab" aria-selected={monitoringChart === key} onClick={() => setMonitoringChart(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-200 ${monitoringChart === key ? "bg-[var(--nextgen-card)] text-[var(--nextgen-primary)] shadow-sm ring-1 ring-[var(--nextgen-border)]" : "text-slate-500 hover:bg-[var(--nextgen-card)] hover:text-slate-700"}`}>{chart.label}</button>)}
                </div>
                <div className="rounded-[var(--nextgen-radius-inner)] border border-[var(--nextgen-border)] bg-gradient-to-b from-slate-50/80 to-white px-2 pb-2 pt-3 shadow-inner shadow-slate-950/[0.015] sm:px-3">
                  <DashboardChart rows={monitoringRows} series={activeMonitoringChart.series} kind={activeMonitoringChart.kind} target={"target" in activeMonitoringChart ? activeMonitoringChart.target : undefined} variant="bar" reducedMotion={reducedMotion} />
                </div>
              </>}
            </SectionFrame>

            <SectionFrame title="SLA Cut Off" description="Rata-rata dan tren SLA harian." href="/dashboard/quality-control/sla-cut-off" section={result.sla} icon={Gauge} tone="emerald">
              {sla && <div className="space-y-4">
                <div className="grid items-center gap-4 rounded-[var(--nextgen-radius-inner)] border border-emerald-100/80 bg-gradient-to-br from-emerald-50/80 via-white to-white p-4 sm:grid-cols-[minmax(110px,0.8fr)_minmax(150px,1.2fr)] xl:grid-cols-1">
                  <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Average SLA</p><p className="mt-2 text-4xl font-bold tracking-tight text-slate-950">{percent(sla.averageSla)}</p><p className="mt-3 inline-flex rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-800">Target {percent(sla.target)}</p></div>
                  <Donut value={Math.min(100, sla.averageSla)} remaining={Math.max(0, 100 - sla.averageSla)} valueLabel="Achieved" remainingLabel="Remaining" center={percent(sla.averageSla)} reducedMotion={reducedMotion} />
                </div>
                <div className="rounded-[var(--nextgen-radius-inner)] border border-[var(--nextgen-border)] bg-slate-50/35 px-2 pb-2 pt-3">
                  <DashboardChart rows={sla.daily} kind="percent" target={sla.target} variant="bar" compact reducedMotion={reducedMotion} series={[{ key: "sla", label: "SLA Harian", color: "var(--nextgen-primary)" }]} />
                </div>
              </div>}
            </SectionFrame>

            <SectionFrame title="Problem Waybill Stuck" description="Waybill stuck hari ini." href="/dashboard/quality-control/waybill-stuck-delivery" section={result.stuckDelivery} icon={PackageSearch} tone="amber">
              {stuck && <div className="relative flex min-h-0 flex-col justify-between overflow-hidden rounded-[var(--nextgen-radius-inner)] border border-amber-100 bg-gradient-to-br from-amber-50/80 via-white to-white p-4">
                <span className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-amber-100/55 blur-2xl" aria-hidden="true" />
                <div>
                  <div className="relative flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">Total Stuck Hari Ini</p>
                    <span className="rounded-full border border-amber-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-900 shadow-sm">
                      Data per {fullDate(stuck.todayDate ?? startDate)}
                    </span>
                  </div>
                  <p className="relative mt-3 text-5xl font-bold tracking-[-0.04em] text-[var(--nextgen-text-primary)]">{number(stuck.totalStuckToday ?? stuck.totalInventory)}</p>
                  <p className={`relative mt-3 text-xs font-semibold ${stuck.waybillStuckMaximum == null ? "text-slate-500" : stuckWithinTarget ? "text-[var(--nextgen-success)]" : "text-[var(--nextgen-danger)]"}`}>
                    {stuck.waybillStuckMaximum == null
                      ? "Target belum diatur"
                      : stuckWithinTarget
                        ? `Dalam batas target (maks. ${number(stuck.waybillStuckMaximum)})`
                        : `Melebihi target (maks. ${number(stuck.waybillStuckMaximum)})`}
                  </p>
                </div>
                {(stuck.totalStuckToday ?? stuck.totalInventory) === 0 ? (
                  <EmptyState kind="monitoring" label="Tidak ada waybill stuck hari ini" className="ml-auto w-32" />
                ) : (
                  <span className="relative ml-auto mt-4 grid size-16 place-items-center rounded-2xl border border-amber-200/70 bg-white/75 text-[var(--nextgen-warning)] shadow-sm" aria-hidden="true"><PackageSearch size={42} strokeWidth={1.6} /></span>
                )}
              </div>}
            </SectionFrame>
          </div>

          <div className="grid gap-5 2xl:grid-cols-2">
            <SectionFrame title="Delivery Settlement" description="Nominal final dari Delivery Settlement." href="/dashboard/settlement/delivery" section={result.deliverySettlement} icon={ReceiptText} tone="blue">
              {delivery && <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <DashboardMetricCard label="COD Tunai" value={money(delivery.summary.codCash)} icon={Banknote} tone="emerald" index={0} />
                  <DashboardMetricCard label="Total COD QRIS" value={money(delivery.summary.codQris)} icon={QrCode} tone="violet" index={1} />
                  <DashboardMetricCard label="Total DFOD" value={money(delivery.summary.dfod)} icon={Truck} tone="amber" index={2} />
                  <DashboardMetricCard label="Total Setoran" value={money(delivery.summary.totalSettlement)} icon={ReceiptText} tone="blue" index={3} />
                </div>
                <DashboardChart rows={delivery.daily.map((row) => ({ ...row, codCash: Number(row.codCash), codQris: Number(row.codQris), dfod: Number(row.dfod), totalSettlement: Number(row.totalSettlement) }))} kind="money" compact reducedMotion={reducedMotion} series={[{ key: "codCash", label: "COD Tunai", color: "var(--nextgen-primary-hover)" }, { key: "codQris", label: "COD QRIS", color: "var(--nextgen-purple)" }, { key: "dfod", label: "DFOD", color: "var(--nextgen-warning)" }, { key: "totalSettlement", label: "Total Setoran", color: "var(--nextgen-success)" }]} />
              </div>}
            </SectionFrame>

            <SectionFrame title="Operational Settlement" description="Mirror arus operasional tanpa mengubah transaksi sumber." href="/dashboard/settlement/operational" section={result.operationalSettlement} icon={Landmark} tone="emerald">
              {operational && <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <DashboardMetricCard label="Cash Diterima" value={money(operational.summary.cashReceived)} icon={CircleArrowDown} tone="emerald" index={0} />
                  <DashboardMetricCard label="Cash Tersedia" value={money(operational.summary.cashAvailable)} icon={CreditCard} tone="blue" index={1} />
                  <DashboardMetricCard label="Pengeluaran Operasional" value={money(operational.summary.operationalExpense)} icon={CircleArrowUp} tone="amber" index={2} />
                  <DashboardMetricCard label="Belum Diterima" value={<span className="text-[var(--nextgen-danger)]">{money(operational.summary.outstanding)}</span>} note="Kewajiban belum diterima" noteTone="warning" icon={CircleAlert} tone="red" index={3} />
                </div>
                <DashboardChart rows={operational.daily.map((row) => ({ ...row, cashReceived: Number(row.cashReceived), cashAvailable: Number(row.cashAvailable), operationalExpense: Number(row.operationalExpense) }))} kind="money" variant="bar" compact reducedMotion={reducedMotion} series={[{ key: "cashReceived", label: "Cash Diterima", color: "var(--nextgen-success)" }, { key: "operationalExpense", label: "Pengeluaran", color: "var(--nextgen-warning)" }, { key: "cashAvailable", label: "Cash Tersedia", color: "var(--nextgen-primary)" }]} />
              </div>}
            </SectionFrame>
          </div>

          <div className="grid items-stretch gap-5 xl:grid-cols-2">
            <SectionFrame title="Payment Settlement" description="Posisi Cash On Hand saat ini." href="/dashboard/payment/settlement" section={result.paymentSettlement} icon={Wallet} tone="blue">
              {payment && <DashboardMetricCard label="Cash On Hand" value={<span className="text-3xl">{money(payment.cashOnHand)}</span>} note="Current-state Payment Settlement" icon={Wallet} tone="blue" index={0} />}
            </SectionFrame>
            <SectionFrame title="Pickup Payment" description="Outstanding dan overdue Pickup Payment." href="/dashboard/payment/pickup" section={result.pickupPayment} icon={Hourglass} tone="violet">
              {pickup && <div className="grid gap-3 sm:grid-cols-2">
                <DashboardMetricCard label="Outstanding" value={<span className="text-3xl">{money(pickup.summary.outstanding)}</span>} note={`${number(pickup.summary.outstandingWaybills)} waybill`} icon={Hourglass} tone="amber" index={0} />
                <DashboardMetricCard label="Overdue > 7 Hari" value={<span className="text-3xl text-[var(--nextgen-danger)]">{number(pickup.summary.overdueOver7)}</span>} note="Perlu tindak lanjut" noteTone="warning" icon={TriangleAlert} tone="red" index={1} />
              </div>}
            </SectionFrame>
          </div>
        </div>
      )}
      <style jsx global>{`
        @keyframes dashboard-card-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dashboard-content .dashboard-metric-card {
          animation: dashboard-card-in 360ms ease-out both;
          animation-delay: var(--dashboard-delay, 0ms);
        }

        .dashboard-toolbar button,
        .dashboard-toolbar .dashboard-date-input {
          height: 2.5rem;
        }

        .dashboard-toolbar button {
          padding-inline: 0.75rem;
        }

        .dashboard-date-input {
          width: 8.75rem;
        }

        @media (max-width: 639px) {
          .dashboard-date-input {
            width: 100%;
          }
        }

        @media (min-width: 640px) and (max-width: 1023px) {
          .dashboard-kpi-strip > :last-child {
            grid-column: span 2 / span 2;
          }
        }

        @media (min-width: 1400px) {
          .dashboard-analytics-grid {
            grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
          }

          .dashboard-monitoring-panel {
            grid-column: span 1 / span 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-content .dashboard-metric-card {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function dateValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`).valueOf();
}

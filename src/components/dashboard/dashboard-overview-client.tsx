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
  Activity,
  ArrowUpRight,
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
  FilterCard,
  PageHeader,
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
    <div className={compact ? "h-40 w-full" : "h-72 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        {variant === "bar" ? (
          <BarChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 2 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={labelDate} tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis tickFormatter={(value) => kind === "money" ? `${Math.round(Number(value) / 1000)}k` : number(value)} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip formatter={(value, name) => [format(value), name]} labelFormatter={(value) => fullDate(String(value))} cursor={{ fill: "#f8fafc" }} />
            <Legend />
            {series.map((item) => (
              <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={!reducedMotion} animationDuration={700} animationEasing="ease-out" />
            ))}
            {target !== undefined && (
              <ReferenceLine y={target} name={`Target ${percent(target)}`} stroke="#94a3b8" strokeDasharray="6 5" />
            )}
          </BarChart>
        ) : (
          <LineChart data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={labelDate} tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis tickFormatter={(value) => kind === "money" ? `${Math.round(Number(value) / 1000)}k` : number(value)} tick={{ fontSize: 11, fill: "#94a3b8" }} />
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
  colors = ["#16a34a", "#e2e8f0"],
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
    <div className="relative h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={66} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={!reducedMotion} animationDuration={750} animationEasing="ease-out" />
          <Tooltip formatter={(item) => {
            const numeric = Number(item);
            const share = total > 0 ? numeric / total * 100 : 0;
            return `${number(numeric, 2)} (${percent(share)})`;
          }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="text-2xl font-extrabold text-slate-900">{center}</span>
      </div>
    </div>
  );
}

const metricToneClasses = {
  blue: "bg-blue-50 text-blue-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-700",
  violet: "bg-violet-50 text-violet-700",
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
      className="dashboard-metric-card flex min-h-28 h-full flex-col p-4 transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
      style={{ "--dashboard-delay": `${Math.min(index, 8) * 45}ms` } as CSSProperties}
    >
      <span className={`grid size-8 place-items-center rounded-lg ${metricToneClasses[tone]}`} aria-hidden="true">
        <Icon size={17} strokeWidth={2} />
      </span>
      <p className="mt-3 text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      {note && (
        <p className={`mt-auto pt-1.5 text-xs ${noteTone === "warning" ? "text-amber-700" : "text-slate-500"}`}>
          {note}
        </p>
      )}
    </AppCard>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-72 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      Belum ada histori pada periode ini.
    </div>
  );
}

function SectionFrame({
  title,
  href,
  description,
  section,
  children,
}: {
  title: string;
  href: string;
  description: string;
  section: DashboardSection<unknown>;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="text-right">
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-800">
            Lihat Detail <ArrowUpRight size={16} />
          </Link>
          {section.status === "success" && section.updatedAt && (
            <p className="mt-1 text-[11px] text-slate-400">
              Sync {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(section.updatedAt))}
            </p>
          )}
        </div>
      </div>
      {section.status === "error" ? (
        <AppCard className="border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {section.error.message} Section lain tetap dapat digunakan.
        </AppCard>
      ) : children}
    </section>
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
    achievement: { label: "Achievement Delivery", series: [{ key: "achievement", label: "Achievement", color: "#16a34a" }], kind: "percent" as const, target: monitoring?.target },
    ttd: { label: "TTD vs Pending", series: [{ key: "totalTtd", label: "Total TTD", color: "#2563eb" }, { key: "pending", label: "Pending", color: "#dc2626" }], kind: "number" as const },
    revenue: { label: "Pickup Omset Harian", series: [{ key: "pickupRevenue", label: "Pickup Omset", color: "#1d4ed8" }], kind: "money" as const },
    weight: { label: "Berat Pickup Harian", series: [{ key: "pickupWeight", label: "Berat Pickup", color: "#f59e0b" }], kind: "weight" as const },
  };
  const activeMonitoringChart = monitoringCharts[monitoringChart as keyof typeof monitoringCharts];

  return (
    <div className="mx-auto max-w-[1800px] space-y-8">
      <PageHeader
        eyebrow="Operational Executive Dashboard"
        title="Dashboard Operasional"
        description={`Mirror read-only seluruh operasional ${outletCode ?? "outlet aktif"}.`}
        actions={result ? (
          <span className="text-right text-xs text-slate-500">
            Terakhir diperbarui<br />
            <strong className="text-slate-700">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(result.updatedAt))}</strong>
          </span>
        ) : undefined}
      />

      <FilterCard className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(2,minmax(170px,220px))_1fr_auto]">
          <label className="text-xs font-semibold text-slate-600">Tanggal Awal
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={`${nextgenControlClass} mt-1 w-full`} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Tanggal Akhir
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={`${nextgenControlClass} mt-1 w-full`} />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={() => applyPeriod({ startDate: jakartaToday(), endDate: jakartaToday() })} className={nextgenButtonClass + " border border-slate-200 bg-white text-slate-700"}>Hari Ini</button>
            <button type="button" onClick={() => applyPeriod(monthRange(jakartaToday()))} className={nextgenButtonClass + " border border-slate-200 bg-white text-slate-700"}>Bulan Ini</button>
            <button type="button" aria-label="Bulan Sebelumnya" onClick={() => applyPeriod(shiftMonth(startDate, -1))} className={nextgenButtonClass + " border border-slate-200 bg-white px-3 text-slate-700"}><ChevronLeft size={17} /></button>
            <button type="button" aria-label="Bulan Berikutnya" onClick={() => applyPeriod(shiftMonth(startDate, 1))} className={nextgenButtonClass + " border border-slate-200 bg-white px-3 text-slate-700"}><ChevronRight size={17} /></button>
          </div>
          <button type="button" disabled={loading || !validRange} onClick={() => setRefreshKey((value) => value + 1)} className={nextgenButtonClass + " self-end bg-blue-600 text-white hover:bg-blue-700"}>
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <CalendarDays size={15} />
          <span>{fullDate(startDate)} – {fullDate(endDate)}</span>
          <span>· maksimum 366 hari</span>
        </div>
        {!validRange && <p role="alert" className="text-sm font-medium text-red-700">Rentang wajib berurutan dan maksimum 366 hari.</p>}
      </FilterCard>

      {error && <AppCard className="border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</AppCard>}
      {loading && !result ? <SkeletonDashboard /> : result && (
        <div key={presentationKey} className={loading ? "dashboard-content space-y-14 opacity-70 transition" : "dashboard-content space-y-14 transition"} aria-busy={loading}>
          <SectionFrame title="Monitoring Operations" description="Mirror Monitoring Daily dan Monthly." href="/dashboard/monitoring/monthly" section={result.monitoring}>
            {monitoring && <>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DashboardMetricCard label="Achievement Delivery" value={percent(monitoring.summary.achievement)} note={`Target ${percent(monitoring.target)}`} icon={Gauge} tone="emerald" index={0} />
                  <DashboardMetricCard label="Total TTD" value={number(monitoring.summary.totalTtd)} icon={CircleCheckBig} tone="blue" index={1} />
                  <DashboardMetricCard label="Pending" value={<span className="text-red-700">{number(monitoring.summary.totalPending)}</span>} icon={CircleAlert} tone="red" index={2} />
                  <DashboardMetricCard label="Pickup Omset" value={money(monitoring.summary.pickupRevenue)} icon={Wallet} tone="violet" index={3} />
                  <DashboardMetricCard label="Total Berat Pickup" value={`${number(monitoring.summary.pickupWeight, 2)} kg`} icon={Scale} tone="amber" index={4} />
                </div>
                <AppCard className="p-5 lg:p-6">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {Object.entries(monitoringCharts).map(([key, chart]) => <button key={key} type="button" onClick={() => setMonitoringChart(key)} className={`rounded-lg px-3 py-2 text-xs font-bold ${monitoringChart === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{chart.label}</button>)}
                  </div>
                  <DashboardChart rows={monitoringRows} series={activeMonitoringChart.series} kind={activeMonitoringChart.kind} target={"target" in activeMonitoringChart ? activeMonitoringChart.target : undefined} variant="bar" reducedMotion={reducedMotion} />
                </AppCard>
              </div>
            </>}
          </SectionFrame>

          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Quality Control Overview</h2>
              <p className="mt-1 text-sm text-slate-500">Ringkasan SLA Cut Off dan Waybill Stuck Delivery.</p>
            </div>
            <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <SectionFrame title="SLA Cut Off" description="Rata-rata SLA dengan tren harian sebagai informasi sekunder." href="/dashboard/quality-control/sla-cut-off" section={result.sla}>
                {sla && <div className="grid gap-4 sm:grid-cols-2">
                  <DashboardMetricCard label="Average SLA" value={<span className="text-3xl">{percent(sla.averageSla)}</span>} note={`Target existing ${percent(sla.target)}`} icon={Activity} tone="emerald" index={0} />
                  <AppCard className="p-3"><Donut value={Math.min(100, sla.averageSla)} remaining={Math.max(0, 100 - sla.averageSla)} valueLabel="Achieved" remainingLabel="Remaining" center={percent(sla.averageSla)} reducedMotion={reducedMotion} /></AppCard>
                  <AppCard className="p-5 sm:col-span-2"><DashboardChart rows={sla.daily} kind="percent" target={sla.target} variant="bar" compact reducedMotion={reducedMotion} series={[{ key: "sla", label: "SLA Harian", color: "#475569" }]} /></AppCard>
                </div>}
              </SectionFrame>

              <SectionFrame title="Waybill Stuck Delivery" description="KPI inventory stuck pada periode aktif." href="/dashboard/quality-control/waybill-stuck-delivery" section={result.stuckDelivery}>
                {stuck && <DashboardMetricCard label="Total Inventory" value={<span className="text-3xl">{number(stuck.totalInventory)}</span>} note="Waybill dalam inventory" icon={PackageSearch} tone="amber" index={0} />}
              </SectionFrame>
            </div>
          </section>

          <SectionFrame title="Delivery Settlement" description="Nominal final dari Delivery Settlement." href="/dashboard/settlement/delivery" section={result.deliverySettlement}>
            {delivery && <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardMetricCard label="COD Tunai" value={money(delivery.summary.codCash)} icon={Banknote} tone="emerald" index={0} />
                <DashboardMetricCard label="Total COD QRIS" value={money(delivery.summary.codQris)} icon={QrCode} tone="violet" index={1} />
                <DashboardMetricCard label="Total DFOD" value={money(delivery.summary.dfod)} icon={Truck} tone="amber" index={2} />
                <DashboardMetricCard label="Total Setoran" value={money(delivery.summary.totalSettlement)} icon={ReceiptText} tone="blue" index={3} />
              </div>
              <AppCard className="p-5"><DashboardChart rows={delivery.daily.map((row) => ({ ...row, codCash: Number(row.codCash), codQris: Number(row.codQris), dfod: Number(row.dfod), totalSettlement: Number(row.totalSettlement) }))} kind="money" reducedMotion={reducedMotion} series={[{ key: "codCash", label: "COD Tunai", color: "#1d4ed8" }, { key: "codQris", label: "COD QRIS", color: "#7c3aed" }, { key: "dfod", label: "DFOD", color: "#f59e0b" }, { key: "totalSettlement", label: "Total Setoran", color: "#16a34a" }]} /></AppCard>
            </>}
          </SectionFrame>

          <SectionFrame title="Operational Settlement" description="Mirror arus operasional tanpa mengubah transaksi sumber." href="/dashboard/settlement/operational" section={result.operationalSettlement}>
            {operational && <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardMetricCard label="Cash Diterima" value={money(operational.summary.cashReceived)} icon={CircleArrowDown} tone="emerald" index={0} />
                <DashboardMetricCard label="Cash Tersedia" value={money(operational.summary.cashAvailable)} icon={CreditCard} tone="blue" index={1} />
                <DashboardMetricCard label="Pengeluaran Operasional" value={money(operational.summary.operationalExpense)} icon={CircleArrowUp} tone="amber" index={2} />
                <DashboardMetricCard label="Belum Diterima" value={<span className="text-red-700">{money(operational.summary.outstanding)}</span>} note="Kewajiban yang belum diterima" noteTone="warning" icon={CircleAlert} tone="red" index={3} />
              </div>
              <AppCard className="p-5 lg:p-6"><DashboardChart rows={operational.daily.map((row) => ({ ...row, cashReceived: Number(row.cashReceived), cashAvailable: Number(row.cashAvailable), operationalExpense: Number(row.operationalExpense) }))} kind="money" variant="bar" reducedMotion={reducedMotion} series={[{ key: "cashReceived", label: "Cash Diterima", color: "#334155" }, { key: "operationalExpense", label: "Pengeluaran", color: "#b45309" }, { key: "cashAvailable", label: "Cash Tersedia", color: "#1d4ed8" }]} /></AppCard>
            </>}
          </SectionFrame>

          <div className="grid gap-10 xl:grid-cols-2 xl:gap-8">
            <SectionFrame title="Payment Settlement" description="Posisi Cash On Hand saat ini." href="/dashboard/payment/settlement" section={result.paymentSettlement}>
              {payment && <div className="max-w-xl"><DashboardMetricCard label="Cash On Hand" value={<span className="text-3xl">{money(payment.cashOnHand)}</span>} note="Current-state Payment Settlement" icon={Wallet} tone="blue" index={0} /></div>}
            </SectionFrame>

            <SectionFrame title="Pickup Payment" description="Outstanding dan overdue Pickup Payment." href="/dashboard/payment/pickup" section={result.pickupPayment}>
              {pickup && <div className="grid gap-4 sm:grid-cols-2">
                <DashboardMetricCard label="Outstanding" value={<span className="text-3xl">{money(pickup.summary.outstanding)}</span>} note={`${number(pickup.summary.outstandingWaybills)} waybill`} icon={Hourglass} tone="amber" index={0} />
                <DashboardMetricCard label="Overdue > 7 Hari" value={<span className="text-3xl text-red-700">{number(pickup.summary.overdueOver7)}</span>} note="Perlu tindak lanjut" noteTone="warning" icon={TriangleAlert} tone="red" index={1} />
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

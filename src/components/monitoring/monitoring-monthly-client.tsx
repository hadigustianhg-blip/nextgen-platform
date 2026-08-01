"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  FilterCard,
  MetricCard,
  PageHeader,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
} from "@/components/ui";

type Pagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type DeliveryRow = {
  teamName: string;
  totalDelivery: number;
  totalTtd: number;
  totalPending: number;
  deliveryWeight: string;
  achievement: number;
  target: number;
  status: "ACHIEVE" | "NOT ACHIEVE";
  activeDays: number;
};
type PickupRow = {
  staffName: string;
  totalWaybills: number;
  regularRevenue: string;
  regularWeight: string;
  marketplaceWeight: string;
  totalWeight: string;
  activeDays: number;
  averageWaybillsPerDay: number;
  averageRevenuePerDay: string;
};
type Result = {
  period: { startDate: string; endDate: string };
  target: number;
  summary: {
    deliveryAchievement: number;
    totalDelivery: number;
    totalTtd: number;
    totalPending: number;
    totalDeliveryWeight: string;
    totalPickupWaybills: number;
    pickupRevenue: string;
    pickupRegularWeight: string;
    pickupMarketplaceWeight: string;
    pickupWeight: string;
  };
  delivery: Pagination & { items: DeliveryRow[] };
  pickup: Pagination & { items: PickupRow[] };
};

const money = (value: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const number = (value: string | number, digits = 0) =>
  new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
  }).format(Number(value));
const percent = (value: number) => `${number(value, 2)}%`;
const monthEnd = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};
const periodLabel = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return "Periode belum valid";
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Periode ${formatter.format(new Date(`${startDate}T00:00:00Z`))} – ${formatter.format(new Date(`${endDate}T00:00:00Z`))}`;
};

export function MonitoringMonthlyClient({
  outlets,
  initialOutletId,
  initialStartDate,
  initialEndDate,
  outletLocked,
}: {
  outlets: Array<{ id: string; code: string; name: string }>;
  initialOutletId: string;
  initialStartDate: string;
  initialEndDate: string;
  outletLocked: boolean;
}) {
  const [outletId, setOutletId] = useState(initialOutletId);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [pickupPage, setPickupPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const validRange =
    Boolean(startDate && endDate) &&
    startDate <= endDate &&
    startDate.slice(0, 7) === endDate.slice(0, 7);

  const load = useCallback(async () => {
    if (!outletId || !validRange) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      outletId,
      startDate,
      endDate,
      deliveryPage: String(deliveryPage),
      pickupPage: String(pickupPage),
      pageSize: "25",
      _: String(refreshKey),
    });
    try {
      const response = await fetch(`/api/monitoring/monthly?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setResult((await response.json()) as Result);
    } catch {
      setError("Monitoring Monthly belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [
    deliveryPage,
    endDate,
    outletId,
    pickupPage,
    refreshKey,
    startDate,
    validRange,
  ]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function updatePeriod(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
    setDeliveryPage(1);
    setPickupPage(1);
    setError("");
  }

  const achievement = result?.summary.deliveryAchievement ?? 0;
  const target = result?.target ?? 95;
  const achieved = achievement >= target;
  const periodMonth = /^\d{4}-\d{2}/.test(endDate)
    ? endDate.slice(0, 7)
    : initialEndDate.slice(0, 7);
  const currentMonthStart = `${periodMonth}-01`;
  const currentMonthEnd = monthEnd(currentMonthStart);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Monitoring Monthly"
        description="Akumulasi performa Delivery dan Pickup berdasarkan rentang Business Date."
      />
      <FilterCard className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(170px,220px)_minmax(170px,220px)_minmax(220px,1fr)_auto]">
          <input
            aria-label="Tanggal Mulai"
            type="date"
            value={startDate}
            onChange={(event) => updatePeriod(event.target.value, endDate)}
            className={nextgenControlClass}
          />
          <input
            aria-label="Tanggal Selesai"
            type="date"
            value={endDate}
            onChange={(event) => updatePeriod(startDate, event.target.value)}
            className={nextgenControlClass}
          />
          <select
            aria-label="Outlet"
            value={outletId}
            disabled={outletLocked}
            onChange={(event) => {
              setOutletId(event.target.value);
              setDeliveryPage(1);
              setPickupPage(1);
            }}
            className={nextgenControlClass}
          >
            {outlets.length === 0 && (
              <option value="">Outlet tidak tersedia</option>
            )}
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.code} · {outlet.name}
              </option>
            ))}
          </select>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row xl:col-span-1">
            <button
              type="button"
              disabled={loading || !validRange || !outletId}
              onClick={() => setRefreshKey((value) => value + 1)}
              className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            >
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">
            Shortcut:
          </span>
          <ShortcutButton
            label="Bulan Ini"
            onClick={() => updatePeriod(initialStartDate, initialEndDate)}
          />
          <ShortcutButton
            label="1–15"
            onClick={() => updatePeriod(currentMonthStart, `${periodMonth}-15`)}
          />
          <ShortcutButton
            label="16–Akhir Bulan"
            onClick={() => updatePeriod(`${periodMonth}-16`, currentMonthEnd)}
          />
        </div>
      </FilterCard>

      {!validRange && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Tanggal mulai dan selesai wajib berurutan dalam bulan yang sama.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Achievement Delivery"
          value={
            <span className={achieved ? "text-emerald-700" : "text-red-700"}>
              {percent(achievement)}
            </span>
          }
          note={`Target ${percent(target)}`}
        />
        <MetricCard
          label="Total Delivery"
          value={`${number(result?.summary.totalDelivery ?? 0)} Resi`}
        />
        <MetricCard
          label="Total TTD"
          value={`${number(result?.summary.totalTtd ?? 0)} Resi`}
        />
        <MetricCard
          label="Total Pending"
          value={`${number(result?.summary.totalPending ?? 0)} Resi`}
        />
        <MetricCard
          label="Total Berat Delivery"
          value={`${number(result?.summary.totalDeliveryWeight ?? "0", 3)} Kg`}
        />
        <MetricCard
          label="Total Resi Pickup"
          value={`${number(result?.summary.totalPickupWaybills ?? 0)} Resi`}
        />
        <MetricCard
          label="Total Omset Reguler"
          value={money(result?.summary.pickupRevenue ?? "0")}
        />
        <MetricCard
          label="Total Berat Reguler"
          value={`${number(result?.summary.pickupRegularWeight ?? "0", 3)} Kg`}
        />
        <MetricCard
          label="Total Berat Marketplace"
          value={`${number(result?.summary.pickupMarketplaceWeight ?? "0", 3)} Kg`}
        />
        <MetricCard
          label="Total Berat Pickup"
          value={`${number(result?.summary.pickupWeight ?? "0", 3)} Kg`}
        />
      </section>

      <p className="text-sm font-semibold text-slate-600">
        {periodLabel(startDate, endDate)}
      </p>

      <section className="space-y-6">
        <TableCard
          footer={
            <PaginationFooter
              pagination={result?.delivery}
              label={`${result?.delivery.total ?? 0} team`}
              onPrevious={() => setDeliveryPage((value) => value - 1)}
              onNext={() => setDeliveryPage((value) => value + 1)}
            />
          }
        >
          <TableTitle
            title="Delivery Monitoring Monthly"
            description="Akumulasi delivery per nama team."
          />
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Nama Team",
                    "Total Delivery",
                    "Total TTD",
                    "Total Pending",
                    "Berat Delivery",
                    "Achievement",
                    "Target",
                    "Status",
                    "Hari Aktif",
                  ].map((label) => (
                    <th
                      key={label}
                      className={`px-4 py-3 ${
                        !["Nama Team", "Status"].includes(label)
                          ? "text-right"
                          : ""
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <EmptyRow columns={9} message="Memuat data…" />
                ) : result?.delivery.items.length ? (
                  result.delivery.items.map((row) => (
                    <tr key={row.teamName}>
                      <td className="px-4 py-3 font-semibold">
                        {row.teamName}
                      </td>
                      <NumberCell>{number(row.totalDelivery)}</NumberCell>
                      <NumberCell>{number(row.totalTtd)}</NumberCell>
                      <NumberCell>{number(row.totalPending)}</NumberCell>
                      <NumberCell>{number(row.deliveryWeight, 3)} Kg</NumberCell>
                      <NumberCell className="font-bold">
                        {percent(row.achievement)}
                      </NumberCell>
                      <NumberCell>{percent(row.target)}</NumberCell>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <NumberCell>{number(row.activeDays)}</NumberCell>
                    </tr>
                  ))
                ) : (
                  <EmptyRow
                    columns={9}
                    message="Belum ada data Delivery pada periode ini."
                  />
                )}
              </tbody>
            </table>
          </div>
        </TableCard>

        <TableCard
          footer={
            <PaginationFooter
              pagination={result?.pickup}
              label={`${result?.pickup.total ?? 0} staff`}
              onPrevious={() => setPickupPage((value) => value - 1)}
              onNext={() => setPickupPage((value) => value + 1)}
            />
          }
        >
          <TableTitle
            title="Pickup Monitoring Monthly"
            description="Akumulasi pickup per nama staff."
          />
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-[1250px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Nama Staff",
                    "Total Resi",
                    "Omset Reguler",
                    "Berat Reguler",
                    "Berat Marketplace",
                    "Total Berat",
                    "Hari Aktif",
                    "Rata-rata Resi/Hari",
                    "Rata-rata Omset/Hari",
                  ].map((label) => (
                    <th
                      key={label}
                      className={`px-4 py-3 ${
                        label === "Nama Staff" ? "" : "text-right"
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <EmptyRow columns={9} message="Memuat data…" />
                ) : result?.pickup.items.length ? (
                  result.pickup.items.map((row) => (
                    <tr key={row.staffName}>
                      <td className="px-4 py-3 font-semibold">
                        {row.staffName}
                      </td>
                      <NumberCell>{number(row.totalWaybills)}</NumberCell>
                      <NumberCell>{money(row.regularRevenue)}</NumberCell>
                      <NumberCell>{number(row.regularWeight, 3)} Kg</NumberCell>
                      <NumberCell>
                        {number(row.marketplaceWeight, 3)} Kg
                      </NumberCell>
                      <NumberCell className="font-bold">
                        {number(row.totalWeight, 3)} Kg
                      </NumberCell>
                      <NumberCell>{number(row.activeDays)}</NumberCell>
                      <NumberCell>
                        {number(row.averageWaybillsPerDay, 2)}
                      </NumberCell>
                      <NumberCell>{money(row.averageRevenuePerDay)}</NumberCell>
                    </tr>
                  ))
                ) : (
                  <EmptyRow
                    columns={9}
                    message="Belum ada data Pickup pada periode ini."
                  />
                )}
              </tbody>
            </table>
          </div>
        </TableCard>
      </section>
    </div>
  );
}

function ShortcutButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function TableTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function NumberCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 text-right ${className}`}>{children}</td>;
}

function StatusBadge({ status }: { status: DeliveryRow["status"] }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
        status === "ACHIEVE"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {status}
    </span>
  );
}

function EmptyRow({ columns, message }: { columns: number; message: string }) {
  return (
    <tr>
      <td colSpan={columns} className="py-14 text-center text-slate-500">
        {message}
      </td>
    </tr>
  );
}

function PaginationFooter({
  pagination,
  label,
  onPrevious,
  onNext,
}: {
  pagination?: Pagination;
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const page = pagination?.page ?? 1;
  const totalPages = Math.max(1, pagination?.totalPages ?? 0);
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 text-slate-600">
      <span>{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" disabled={page <= 1} onClick={onPrevious}>
          Sebelumnya
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button type="button" disabled={page >= totalPages} onClick={onNext}>
          Berikutnya
        </button>
      </div>
    </div>
  );
}

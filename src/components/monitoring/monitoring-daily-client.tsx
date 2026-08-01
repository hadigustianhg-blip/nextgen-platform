"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudDownload, RefreshCw } from "lucide-react";
import {
  FilterCard,
  MetricCard,
  PageHeader,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
} from "@/components/ui";

type DeliveryRow = {
  businessDate: string;
  teamName: string;
  totalDelivery: number;
  totalTtd: number;
  totalPending: number;
  deliveryWeight: string;
  achievement: number;
  target: number;
  status: "ACHIEVE" | "NOT ACHIEVE";
};

type PickupRow = {
  businessDate: string;
  staffName: string;
  totalWaybills: number;
  regularRevenue: string;
  regularWeight: string;
  marketplaceWeight: string;
  totalWeight: string;
};

type MonitoringResult = {
  businessDate: string;
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
  delivery: {
    data: DeliveryRow[];
    pagination: Pagination;
  };
  pickup: {
    data: PickupRow[];
    pagination: Pagination;
  };
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const money = (value: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const number = (value: string | number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits }).format(
    Number(value),
  );
const percent = (value: number) => `${number(value, 2)}%`;

export function MonitoringDailyClient({
  outlets,
  initialOutletId,
  outletLocked,
  canSync,
}: {
  outlets: Array<{ id: string; code: string; name: string }>;
  initialOutletId: string;
  outletLocked: boolean;
  canSync: boolean;
}) {
  const [outletId, setOutletId] = useState(initialOutletId);
  const [businessDate, setBusinessDate] = useState("");
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [pickupPage, setPickupPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<MonitoringResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!outletId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      outletId,
      businessDate,
      deliveryPage: String(deliveryPage),
      pickupPage: String(pickupPage),
      pageSize: "10",
      _: String(refreshKey),
    });
    try {
      const response = await fetch(`/api/monitoring/daily?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const next = (await response.json()) as MonitoringResult;
      setResult(next);
      if (!businessDate) setBusinessDate(next.businessDate);
    } catch {
      setError("Monitoring Daily belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [businessDate, deliveryPage, outletId, pickupPage, refreshKey]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function syncData() {
    if (syncing || !outletId) return;
    setSyncing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/monitoring/daily/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outletId,
          businessDate: businessDate || undefined,
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        dispatch?: {
          success: boolean;
          processed?: number;
          received?: number;
          unique?: number;
          created?: number;
          updated?: number;
          duplicateIgnored?: number;
          error?: string;
        };
        pickup?: { success: boolean; processed?: number; error?: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.success) {
        const failed = [
          body.dispatch?.success === false ? "Dispatch" : null,
          body.pickup?.success === false ? "Pickup" : null,
        ].filter(Boolean);
        throw new Error(
          failed.length
            ? `Sinkronisasi gagal pada: ${failed.join(" dan ")}. Data lama tetap ditampilkan.`
            : body.error?.message || "Sinkronisasi data gagal.",
        );
      }
      setNotice({
        tone: "success",
        text: [
          "Sinkronisasi selesai:",
          `diterima dari endpoint ${body.dispatch?.received ?? 0}`,
          `unique waybill ${body.dispatch?.unique ?? 0}`,
          `dibuat ${body.dispatch?.created ?? 0}`,
          `diperbarui ${body.dispatch?.updated ?? 0}`,
          `duplikat diabaikan ${body.dispatch?.duplicateIgnored ?? 0}`,
          `Pickup ${body.pickup?.processed ?? 0}`,
        ].join(" · "),
      });
      setRefreshKey((value) => value + 1);
    } catch (syncError) {
      setNotice({
        tone: "error",
        text:
          syncError instanceof Error
            ? syncError.message
            : "Sinkronisasi data gagal.",
      });
    } finally {
      setSyncing(false);
    }
  }

  const achievement = result?.summary.deliveryAchievement ?? 0;
  const target = result?.target ?? 95;
  const achieved = achievement >= target;

  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="Monitoring Daily"
        description="Monitoring performa Delivery dan Pickup berdasarkan Business Date."
      />

      <FilterCard className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,240px)_minmax(220px,1fr)_auto]">
        <input
          aria-label="Business Date"
          type="date"
          value={businessDate}
          onChange={(event) => {
            setBusinessDate(event.target.value);
            setDeliveryPage(1);
            setPickupPage(1);
          }}
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
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row lg:col-span-1">
          <button
            type="button"
            disabled={loading || syncing || !outletId}
            onClick={() => setRefreshKey((value) => value + 1)}
            className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          {canSync && (
            <button
              type="button"
              disabled={loading || syncing || !outletId}
              onClick={() => void syncData()}
              className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700`}
            >
              {syncing ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <CloudDownload size={17} />
              )}
              {syncing ? "Menyinkronkan..." : "Sinkronkan Data"}
            </button>
          )}
        </div>
      </FilterCard>

      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.text}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <MetricCard
          label="Achievement Delivery"
          value={
            <span className={achieved ? "text-emerald-700" : "text-red-700"}>
              {percent(achievement)}
            </span>
          }
          note={`Target ${percent(target)}`}
          noteTone={achieved ? "muted" : "warning"}
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
          label="Pending"
          value={`${number(result?.summary.totalPending ?? 0)} Resi`}
        />
        <MetricCard
          label="Berat Delivery"
          value={`${number(result?.summary.totalDeliveryWeight ?? "0", 3)} Kg`}
        />
        <MetricCard
          label="Pickup Omset"
          value={money(result?.summary.pickupRevenue ?? "0")}
        />
        <MetricCard
          label="Total Berat Pickup"
          value={`${number(result?.summary.pickupWeight ?? "0", 3)} Kg`}
        />
      </section>

      <section className="space-y-6">
        <TableCard
          className="min-w-0"
          footer={
            <PaginationFooter
              label={`${result?.delivery.pagination.total ?? 0} team`}
              pagination={result?.delivery.pagination}
              onPrevious={() => setDeliveryPage((value) => value - 1)}
              onNext={() => setDeliveryPage((value) => value + 1)}
            />
          }
        >
          <TableTitle
            title="Delivery Monitoring"
            description="Performa delivery per nama team."
          />
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-[1040px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Tanggal",
                    "Nama Team",
                    "Total Delivery",
                    "Total TTD",
                    "Total Pending",
                    "Berat Delivery",
                    "Achievement",
                    "Target",
                    "Status",
                  ].map((label) => (
                    <th
                      key={label}
                      className={`px-4 py-3 ${
                        !["Tanggal", "Nama Team", "Status"].includes(label)
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
                  <LoadingRow columns={9} />
                ) : result?.delivery.data.length ? (
                  result.delivery.data.map((row) => (
                    <tr key={`${row.businessDate}-${row.teamName}`}>
                      <td className="px-4 py-3">{row.businessDate}</td>
                      <td className="px-4 py-3 font-semibold">
                        {row.teamName}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {number(row.totalDelivery)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {number(row.totalTtd)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {number(row.totalPending)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {number(row.deliveryWeight, 3)} Kg
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {percent(row.achievement)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {percent(row.target)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow
                    columns={9}
                    message="Belum ada data Delivery untuk Business Date ini."
                  />
                )}
              </tbody>
            </table>
          </div>
        </TableCard>

        <TableCard
          className="min-w-0"
          footer={
            <PaginationFooter
              label={`${result?.pickup.pagination.total ?? 0} staff`}
              pagination={result?.pickup.pagination}
              onPrevious={() => setPickupPage((value) => value - 1)}
              onNext={() => setPickupPage((value) => value + 1)}
            />
          }
        >
          <TableTitle
            title="Pickup Monitoring"
            description="Performa pickup per nama staff."
          />
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-[840px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Tanggal",
                    "Nama Staff",
                    "Total Resi",
                    "Omset Reguler",
                    "Berat Reguler",
                    "Berat Marketplace",
                    "Total Berat",
                  ].map((label) => (
                    <th
                      key={label}
                      className={`px-4 py-3 ${
                        !["Tanggal", "Nama Staff"].includes(label)
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
                  <LoadingRow columns={7} />
                ) : result?.pickup.data.length ? (
                  result.pickup.data.map((row) => (
                    <tr key={`${row.businessDate}-${row.staffName}`}>
                      <td className="px-4 py-3">{row.businessDate}</td>
                      <td className="px-4 py-3 font-semibold">
                        {row.staffName}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {number(row.totalWaybills)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {money(row.regularRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {number(row.regularWeight, 3)} Kg
                      </td>
                      <td className="px-4 py-3 text-right">
                        {number(row.marketplaceWeight, 3)} Kg
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {number(row.totalWeight, 3)} Kg
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow
                    columns={7}
                    message="Belum ada data Pickup untuk Business Date ini."
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

function PaginationFooter({
  label,
  pagination,
  onPrevious,
  onNext,
}: {
  label: string;
  pagination?: Pagination;
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

function LoadingRow({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns} className="py-14 text-center text-slate-500">
        Memuat data…
      </td>
    </tr>
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

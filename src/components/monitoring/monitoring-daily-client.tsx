"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CloudDownload, RefreshCw, Search, X } from "lucide-react";
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

type DetailMetric =
  | "DELIVERY_ACHIEVEMENT" | "DELIVERY_TOTAL" | "DELIVERY_TTD" | "DELIVERY_PENDING" | "DELIVERY_WEIGHT"
  | "PICKUP_TOTAL" | "PICKUP_REVENUE" | "PICKUP_REGULAR_WEIGHT" | "PICKUP_MARKETPLACE_WEIGHT" | "PICKUP_WEIGHT";
type DetailRow = {
  kind: "DELIVERY" | "PICKUP";
  waybill: string;
  businessDate: string;
  team: string;
  customer: string | null;
  status?: string;
  ttd?: boolean;
  settlement?: string | null;
  revenue?: string;
  weight: string;
  lastActivityAt: string;
};
type DetailResult = {
  metric: DetailMetric;
  businessDate: string;
  team: string | null;
  summary: {
    totalDelivery: number; totalTtd: number; totalPending: number; achievement: number;
    deliveryCount: number; deliveryWeight: string; pickupCount: number; pickupRevenue: string; pickupWeight: string;
  };
  rows: DetailRow[];
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
  initialBusinessDate = "",
  outletLocked,
  canSync,
}: {
  outlets: Array<{ id: string; code: string; name: string }>;
  initialOutletId: string;
  initialBusinessDate?: string;
  outletLocked: boolean;
  canSync: boolean;
}) {
  const [outletId, setOutletId] = useState(initialOutletId);
  const [businessDate, setBusinessDate] = useState(initialBusinessDate);
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
  const [detail, setDetail] = useState<{ title: string; loading: boolean; error: string; result: DetailResult | null } | null>(null);

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

  async function openDetail(metric: DetailMetric, title: string, team?: string) {
    if (!outletId || !(businessDate || result?.businessDate)) return;
    setDetail({ title, loading: true, error: "", result: null });
    const query = new URLSearchParams({ outletId, businessDate: businessDate || result!.businessDate, metric });
    if (team) query.set("team", team);
    try {
      const response = await fetch(`/api/monitoring/daily/detail?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setDetail({ title, loading: false, error: "", result: await response.json() as DetailResult });
    } catch {
      setDetail({ title, loading: false, error: "Rincian monitoring belum dapat dimuat.", result: null });
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
        <ClickableMetric onOpen={() => void openDetail("DELIVERY_ACHIEVEMENT", "Rincian Achievement Delivery")}>
        <MetricCard
          label="Achievement Delivery"
          value={
            <span className={achieved ? "text-emerald-700" : "text-red-700"}>
              {percent(achievement)}
            </span>
          }
          note={`Target ${percent(target)}`}
          noteTone={achieved ? "muted" : "warning"}
        /></ClickableMetric>
        <ClickableMetric onOpen={() => void openDetail("DELIVERY_TOTAL", "Rincian Total Delivery")}><MetricCard
          label="Total Delivery"
          value={`${number(result?.summary.totalDelivery ?? 0)} Resi`}
        /></ClickableMetric>
        <ClickableMetric onOpen={() => void openDetail("DELIVERY_TTD", "Rincian TTD")}><MetricCard
          label="Total TTD"
          value={`${number(result?.summary.totalTtd ?? 0)} Resi`}
        /></ClickableMetric>
        <ClickableMetric onOpen={() => void openDetail("DELIVERY_PENDING", "Rincian Pending")}><MetricCard
          label="Pending"
          value={`${number(result?.summary.totalPending ?? 0)} Resi`}
        /></ClickableMetric>
        <ClickableMetric onOpen={() => void openDetail("DELIVERY_WEIGHT", "Rincian Berat Delivery")}><MetricCard
          label="Berat Delivery"
          value={`${number(result?.summary.totalDeliveryWeight ?? "0", 3)} Kg`}
        /></ClickableMetric>
        <ClickableMetric onOpen={() => void openDetail("PICKUP_REVENUE", "Rincian Pickup Omset")}><MetricCard
          label="Pickup Omset"
          value={money(result?.summary.pickupRevenue ?? "0")}
        /></ClickableMetric>
        <ClickableMetric onOpen={() => void openDetail("PICKUP_WEIGHT", "Rincian Berat Pickup")}><MetricCard
          label="Total Berat Pickup"
          value={`${number(result?.summary.pickupWeight ?? "0", 3)} Kg`}
        /></ClickableMetric>
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
                        <MetricLink onClick={() => void openDetail("DELIVERY_TOTAL", `Rincian Total Delivery · ${row.teamName}`, row.teamName)}>{number(row.totalDelivery)}</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricLink onClick={() => void openDetail("DELIVERY_TTD", `Rincian TTD · ${row.teamName}`, row.teamName)}>{number(row.totalTtd)}</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricLink onClick={() => void openDetail("DELIVERY_PENDING", `Rincian Pending · ${row.teamName}`, row.teamName)}>{number(row.totalPending)}</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricLink onClick={() => void openDetail("DELIVERY_WEIGHT", `Rincian Berat Delivery · ${row.teamName}`, row.teamName)}>{number(row.deliveryWeight, 3)} Kg</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        <MetricLink onClick={() => void openDetail("DELIVERY_ACHIEVEMENT", `Rincian Achievement Delivery · ${row.teamName}`, row.teamName)}>{percent(row.achievement)}</MetricLink>
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
                        <MetricLink onClick={() => void openDetail("PICKUP_TOTAL", `Rincian Total Pickup · ${row.staffName}`, row.staffName)}>{number(row.totalWaybills)}</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricLink onClick={() => void openDetail("PICKUP_REVENUE", `Rincian Pickup Omset · ${row.staffName}`, row.staffName)}>{money(row.regularRevenue)}</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricLink onClick={() => void openDetail("PICKUP_REGULAR_WEIGHT", `Rincian Berat Reguler · ${row.staffName}`, row.staffName)}>{number(row.regularWeight, 3)} Kg</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricLink onClick={() => void openDetail("PICKUP_MARKETPLACE_WEIGHT", `Rincian Berat Marketplace · ${row.staffName}`, row.staffName)}>{number(row.marketplaceWeight, 3)} Kg</MetricLink>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        <MetricLink onClick={() => void openDetail("PICKUP_WEIGHT", `Rincian Total Berat Pickup · ${row.staffName}`, row.staffName)}>{number(row.totalWeight, 3)} Kg</MetricLink>
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
      {detail && <MonitoringDetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ClickableMetric({ children, onOpen }: { children: ReactNode; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-2xl outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      {children}
    </div>
  );
}

function MetricLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {children}
    </button>
  );
}

function MonitoringDetailModal({
  detail,
  onClose,
}: {
  detail: { title: string; loading: boolean; error: string; result: DetailResult | null };
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const query = search.trim().toLocaleUpperCase("id-ID");
    if (!query) return detail.result?.rows ?? [];
    return (detail.result?.rows ?? []).filter((row) =>
      [row.waybill, row.customer, row.team].some((value) => value?.toLocaleUpperCase("id-ID").includes(query)),
    );
  }, [detail.result, search]);
  const result = detail.result;
  const isDelivery = result?.metric.startsWith("DELIVERY_") ?? true;

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={detail.title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-xl font-bold text-slate-950">{detail.title}</h2>{result && <p className="mt-1 text-sm text-slate-500">Business Date {result.businessDate}{result.team ? ` · ${result.team}` : ""}</p>}</div>
          <button type="button" aria-label="Tutup rincian" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </header>
        {detail.loading ? <div className="p-14 text-center text-slate-500">Memuat rincian…</div> : detail.error ? <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{detail.error}</div> : result ? (
          <>
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {isDelivery ? <>
                <DetailStat label="Total Delivery" value={`${number(result.summary.totalDelivery)} Resi`} />
                <DetailStat label="Total TTD" value={`${number(result.summary.totalTtd)} Resi`} />
                <DetailStat label="Pending" value={`${number(result.summary.totalPending)} Resi`} />
                <DetailStat label="Achievement" value={`${number(result.summary.totalTtd)} / ${number(result.summary.totalDelivery)} × 100 = ${percent(result.summary.achievement)}`} />
              </> : <>
                <DetailStat label="Jumlah Pickup" value={`${number(result.summary.pickupCount)} Resi`} />
                <DetailStat label="Total Omset" value={money(result.summary.pickupRevenue)} />
                <DetailStat label="Total Berat" value={`${number(result.summary.pickupWeight, 3)} Kg`} />
              </>}
            </div>
            <div className="border-b border-slate-200 p-4">
              <label className="relative block max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Waybill / Customer / Team" className={`${nextgenControlClass} w-full pl-10`} /></label>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500"><tr>
                  <th className="px-4 py-3">Waybill</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Team / Staff</th><th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">{isDelivery ? "Status / TTD" : "Settlement"}</th><th className="px-4 py-3 text-right">{isDelivery ? "Berat" : "Omset"}</th><th className="px-4 py-3 text-right">{isDelivery ? "Aktivitas Terakhir" : "Berat"}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row) => <tr key={`${row.kind}-${row.waybill}`}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.waybill}</td><td className="px-4 py-3">{row.businessDate}</td><td className="px-4 py-3">{row.team}</td><td className="px-4 py-3">{row.customer || "—"}</td>
                  <td className="px-4 py-3">{isDelivery ? <><span>{row.status}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${row.ttd ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{row.ttd ? "TTD" : "Pending"}</span></> : row.settlement || "—"}</td>
                  <td className="px-4 py-3 text-right">{isDelivery ? `${number(row.weight, 3)} Kg` : money(row.revenue ?? "0")}</td><td className="px-4 py-3 text-right">{isDelivery ? new Date(row.lastActivityAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : `${number(row.weight, 3)} Kg`}</td>
                </tr>) : <EmptyRow columns={7} message="Tidak ada data yang sesuai." />}</tbody>
              </table>
            </div>
            <footer className="border-t border-slate-200 px-5 py-3 text-sm text-slate-500">Menampilkan {number(rows.length)} data</footer>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value}</p></div>;
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

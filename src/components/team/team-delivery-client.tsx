"use client";

import { PackageCheck, CheckCircle2, TimerReset, TrendingUp, Truck, CreditCard, AlertCircle, Clock3 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ShipmentItem = {
  id: string;
  waybillNo: string;
  deliveryStatus: string;
  receiverName: string | null;
  dispatchAt: string;
  chargeWeight: number;
};

type PickupItem = {
  id: string;
  waybillNo: string;
  settlementType: string;
  weight: number;
  fetchedAt: string;
};

type OperationalData = {
  businessDate: string;
  employeeName: string;
  delivery: {
    summary: {
      deliveryToday: number;
      totalTtd: number;
      pending: number;
      achievement: number;
    };
    shipments: ShipmentItem[];
  };
  pickup: {
    summary: {
      pickupToday: number;
      totalWeight: number;
    };
    items: PickupItem[];
  };
  settlement: {
    hasRecord: boolean;
    codAmount: number;
    dfodAmount: number;
    pickupAmount: number;
    totalObligation: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    lastPaymentAt: string | null;
    note: string | null;
  };
};

type ApiBody = {
  success?: boolean;
  data?: unknown;
  error?: { code?: string };
};

const safeErrors: Record<string, string> = {
  UNAUTHORIZED: "Session berakhir. Silakan login kembali.",
  TEAM_CONTEXT_FORBIDDEN: "Akun Team tidak memiliki akses profil yang valid.",
  TEAM_EMPLOYEE_NOT_FOUND: "Data kurir/staff untuk akun Team ini tidak ditemukan.",
  FORBIDDEN: "Akses tidak diizinkan.",
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: ApiBody | null = null;
  try {
    body = text ? (JSON.parse(text) as ApiBody) : null;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.success) {
    throw new Error(safeErrors[body?.error?.code ?? ""] ?? "Gagal memuat data operasional.");
  }
  return body;
}

function formatTimeId(isoStr: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(isoStr));
  } catch {
    return "—";
  }
}

function formatRupiah(value?: number | null) {
  const num = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

export function TeamDeliveryClient({ employeeName, outletCode }: { employeeName: string; outletCode: string }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = (tabParam === "settlement" || tabParam === "pickup" || tabParam === "delivery") ? tabParam : "delivery";

  const [tab, setTab] = useState<"delivery" | "pickup" | "settlement">(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<OperationalData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await requestJson("/api/team/operational");
      setData((res.data as OperationalData) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat data operasional.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Aktivitas Operasional</p>
        <h1 className="mt-1.5 truncate text-2xl font-black tracking-tight text-slate-950">Operasional Saya</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">{employeeName} · Outlet {outletCode}</p>
      </header>

      {/* 3 Tabs: Settlement | Pickup | Delivery */}
      <div className="flex rounded-2xl bg-slate-200/70 p-1 font-bold text-xs">
        <button
          type="button"
          onClick={() => setTab("settlement")}
          className={`flex-1 rounded-xl py-2.5 text-center transition ${tab === "settlement" ? "bg-white text-blue-700 shadow-sm font-extrabold" : "text-slate-600 hover:text-slate-900"}`}
        >
          Settlement
        </button>
        <button
          type="button"
          onClick={() => setTab("pickup")}
          className={`flex-1 rounded-xl py-2.5 text-center transition ${tab === "pickup" ? "bg-white text-blue-700 shadow-sm font-extrabold" : "text-slate-600 hover:text-slate-900"}`}
        >
          Pickup
        </button>
        <button
          type="button"
          onClick={() => setTab("delivery")}
          className={`flex-1 rounded-xl py-2.5 text-center transition ${tab === "delivery" ? "bg-white text-blue-700 shadow-sm font-extrabold" : "text-slate-600 hover:text-slate-900"}`}
        >
          Delivery
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: DELIVERY */}
      {tab === "delivery" && (
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-950">Ringkasan Delivery Hari Ini</h2>
              <span className="text-xs font-semibold text-blue-600">{data?.businessDate ?? "Hari Ini"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric icon={PackageCheck} label="Delivery" value={loading ? "Memuat…" : data ? String(data.delivery.summary.deliveryToday) : "0"} />
              <Metric icon={CheckCircle2} label="TTD" value={loading ? "Memuat…" : data ? String(data.delivery.summary.totalTtd) : "0"} />
              <Metric icon={TimerReset} label="Pending" value={loading ? "Memuat…" : data ? String(data.delivery.summary.pending) : "0"} />
              <Metric icon={TrendingUp} label="Achievement" value={loading ? "Memuat…" : data ? `${data.delivery.summary.achievement.toFixed(2)}%` : "0.00%"} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-extrabold text-slate-950">Daftar Shipment ({data?.delivery.shipments.length ?? 0})</h2>
            {loading ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
                Memuat daftar pengiriman…
              </div>
            ) : !data || data.delivery.shipments.length === 0 ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center">
                <PackageCheck size={32} className="mx-auto text-slate-400" />
                <p className="mt-2 text-sm font-extrabold text-slate-800">Belum ada delivery hari ini</p>
                <p className="mt-1 text-xs text-slate-500">Data delivery akan otomatis muncul setelah discan oleh sistem.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.delivery.shipments.map((item) => {
                  const isSuccess = item.deliveryStatus.toUpperCase().includes("NORMAL") || item.deliveryStatus.toUpperCase().includes("DELIVERED");
                  return (
                    <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.03)]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-sm font-black text-slate-900">{item.waybillNo}</p>
                          {item.receiverName && (
                            <p className="mt-0.5 text-xs text-slate-500">Penerima: <span className="font-semibold text-slate-700">{item.receiverName}</span></p>
                          )}
                        </div>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${isSuccess ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                          {item.deliveryStatus}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-400 font-semibold">
                        <span>Jam: {formatTimeId(item.dispatchAt)}</span>
                        {item.chargeWeight > 0 && <span>Berat: {item.chargeWeight} kg</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: PICKUP */}
      {tab === "pickup" && (
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-950">Ringkasan Pickup Hari Ini</h2>
              <span className="text-xs font-semibold text-blue-600">{data?.businessDate ?? "Hari Ini"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric icon={Truck} label="Total Resi Pickup" value={loading ? "Memuat…" : data ? String(data.pickup.summary.pickupToday) : "0"} />
              <Metric icon={TrendingUp} label="Total Berat" value={loading ? "Memuat…" : data ? `${data.pickup.summary.totalWeight} kg` : "0 kg"} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-extrabold text-slate-950">Daftar Pickup ({data?.pickup.items.length ?? 0})</h2>
            {loading ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
                Memuat daftar pickup…
              </div>
            ) : !data || data.pickup.items.length === 0 ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center">
                <Truck size={32} className="mx-auto text-slate-400" />
                <p className="mt-2 text-sm font-extrabold text-slate-800">Belum ada pickup hari ini</p>
                <p className="mt-1 text-xs text-slate-500">Data resi pickup akan muncul setelah discan atau diinput.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.pickup.items.map((item) => (
                  <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.03)]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-black text-slate-900">{item.waybillNo}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Jenis: <span className="font-semibold text-slate-700">{item.settlementType}</span></p>
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-extrabold text-blue-700">
                        {item.weight} kg
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-400 font-semibold">
                      <span>Jam Sync: {formatTimeId(item.fetchedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: SETTLEMENT */}
      {tab === "settlement" && (
        <div className="space-y-5">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-slate-950">Settlement Hari Ini</h2>
              <span className="text-xs font-semibold text-blue-600">{data?.businessDate ?? "Hari Ini"}</span>
            </div>

            {loading ? (
              <div className="rounded-[22px] border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
                Memuat settlement…
              </div>
            ) : (
              <>
                {/* Visual Highlights: Total Kewajiban & Sisa Setoran */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[22px] border border-blue-900/10 bg-gradient-to-br from-[#0f2b5b] to-blue-700 p-4 text-white shadow-md">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-200">Total Kewajiban</p>
                    <p className="mt-1 truncate text-lg font-black">{formatRupiah(data?.settlement.totalObligation)}</p>
                  </div>
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Sisa Setoran</p>
                    <p className="mt-1 truncate text-lg font-black text-amber-900">{formatRupiah(data?.settlement.remainingAmount)}</p>
                  </div>
                </div>

                {/* Detailed Breakdown Card */}
                <div className="rounded-[22px] border border-slate-200 bg-white p-4 space-y-3 shadow-[0_4px_16px_rgba(15,23,42,0.03)]">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Rincian Setoran Operasional
                  </h3>

                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                    <span className="font-semibold text-slate-600">COD (Tunai)</span>
                    <span className="font-extrabold text-slate-900">{formatRupiah(data?.settlement.codAmount)}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                    <span className="font-semibold text-slate-600">DFOD</span>
                    <span className="font-extrabold text-slate-900">{formatRupiah(data?.settlement.dfodAmount)}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                    <span className="font-semibold text-slate-600">Pickup (Tunai)</span>
                    <span className="font-extrabold text-slate-900">{formatRupiah(data?.settlement.pickupAmount)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-sm">
                    <span className="font-semibold text-slate-600">Sudah Disetor</span>
                    <span className="font-black text-emerald-700">{formatRupiah(data?.settlement.paidAmount)}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-400">Status Settlement</p>
                    <span className={`inline-flex items-center gap-1.5 mt-1 rounded-full px-3 py-1 text-xs font-black ${
                      data?.settlement.status === "SELESAI" ? "bg-emerald-100 text-emerald-800" :
                      data?.settlement.status === "SEBAGIAN" ? "bg-amber-100 text-amber-800" :
                      "bg-slate-100 text-slate-700"
                    }`}>
                      {data?.settlement.status === "SELESAI" ? "LUNAS / SELESAI" :
                       data?.settlement.status === "SEBAGIAN" ? "BELUM LUNAS / PROSES" :
                       "BELUM SETOR / BELUM LUNAS"}
                    </span>
                  </div>
                  {data?.settlement.lastPaymentAt && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-semibold">Update Terakhir</p>
                      <p className="text-xs font-extrabold text-slate-700 mt-1">{formatTimeId(data.settlement.lastPaymentAt)}</p>
                    </div>
                  )}
                </div>

                {data?.settlement.note && (
                  <div className="rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 border border-slate-100 font-semibold">
                    Catatan Operasional: {data.settlement.note}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof PackageCheck; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <span className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-blue-700">
        <Icon size={20} />
      </span>
      <p className="mt-3 truncate text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

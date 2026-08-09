"use client";

import { AlertCircle, Calendar, HandCoins, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type CashAdvanceItem = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
};

type CashAdvanceData = {
  employeeName: string;
  summary: {
    activeCount: number;
    totalAmount: number;
    totalPaid: number;
    totalRemaining: number;
  };
  items: CashAdvanceItem[];
};

type ApiBody = {
  success?: boolean;
  data?: unknown;
  error?: { code?: string };
};

const safeErrors: Record<string, string> = {
  UNAUTHORIZED: "Session berakhir. Silakan login kembali.",
  TEAM_CONTEXT_FORBIDDEN: "Akun Team tidak memiliki akses profil yang valid.",
  TEAM_EMPLOYEE_NOT_FOUND: "Data kasbon untuk akun Team ini tidak ditemukan.",
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
    throw new Error(safeErrors[body?.error?.code ?? ""] ?? "Gagal memuat data kasbon.");
  }
  return body;
}

function formatRupiah(value?: number | null) {
  const num = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function TeamCashAdvanceClient({ employeeName, outletCode }: { employeeName: string; outletCode: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CashAdvanceData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await requestJson("/api/team/cash-advance");
      setData((res.data as CashAdvanceData) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat data kasbon.");
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
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Keuangan Pribadi</p>
        <h1 className="mt-1.5 truncate text-2xl font-black tracking-tight text-slate-950">Kasbon Saya</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">{employeeName} · Outlet {outletCode}</p>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Ringkasan Kasbon Cards */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-amber-900/10 bg-gradient-to-br from-amber-900 to-amber-700 p-4 text-white shadow-md">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-200">Sisa Kasbon</p>
            <p className="mt-1 truncate text-lg font-black">{loading ? "Memuat…" : formatRupiah(data?.summary.totalRemaining)}</p>
          </div>
          <div className="rounded-[22px] border border-blue-200 bg-blue-50 p-4 text-blue-950 shadow-sm">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700">Kasbon Aktif</p>
            <p className="mt-1 truncate text-lg font-black text-blue-900">{loading ? "Memuat…" : `${data?.summary.activeCount ?? 0} record`}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">Total Nominal Awal</p>
            <p className="mt-1 text-sm font-extrabold text-slate-900">{loading ? "Memuat…" : formatRupiah(data?.summary.totalAmount)}</p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">Sudah Dipotong/Dibayar</p>
            <p className="mt-1 text-sm font-extrabold text-emerald-700">{loading ? "Memuat…" : formatRupiah(data?.summary.totalPaid)}</p>
          </div>
        </div>
      </section>

      {/* Daftar Record Kasbon */}
      <section>
        <h2 className="mb-3 text-base font-extrabold text-slate-950">
          Riwayat Kasbon ({data?.items.length ?? 0})
        </h2>

        {loading ? (
          <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
            Memuat data kasbon…
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center">
            <HandCoins size={36} className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm font-extrabold text-slate-800">Tidak ada kasbon aktif</p>
            <p className="mt-1 text-xs text-slate-500">Belum ada catatan kasbon pribadi yang terdaftar untuk akun ini.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.items.map((item) => (
              <div key={item.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.03)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                      <Calendar size={13} /> {formatDate(item.date)}
                    </span>
                    <h3 className="mt-1 text-sm font-extrabold text-slate-900">{item.category}</h3>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                      item.status === "LUNAS"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : item.status === "SEBAGIAN"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}
                  >
                    {item.status === "LUNAS" ? "LUNAS" : item.status === "SEBAGIAN" ? "SEBAGIAN" : "AKTIF"}
                  </span>
                </div>

                {item.description && (
                  <p className="mt-2 text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {item.description}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <p className="text-slate-400 font-semibold">Awal</p>
                    <p className="font-extrabold text-slate-900 mt-0.5">{formatRupiah(item.amount)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold">Dipotong</p>
                    <p className="font-extrabold text-emerald-700 mt-0.5">{formatRupiah(item.paidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-semibold">Sisa</p>
                    <p className="font-extrabold text-amber-900 mt-0.5">{formatRupiah(item.remainingAmount)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

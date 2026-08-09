"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarPlus, CheckCircle2, Clock3, CreditCard, HandCoins, LogIn, LogOut, MapPin, PackageCheck, Stethoscope, TimerReset, TrendingUp } from "lucide-react";

type Attendance = { id: string; status: string; checkInAt: string | null; checkOutAt: string | null };
type TodayData = { businessDate: string; attendance: Attendance | null; location: { configured: boolean; active: boolean; radiusMeters: number | null } };
type ProfileData = { division: string };
type LeaveSummary = { type: "LEAVE" | "PERMISSION" | "SICK"; startDate: string; endDate: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" };
type DeliverySummaryData = { businessDate: string; deliveryToday: number; totalTtd: number; pending: number; achievement: number };
type OperationalSettlementSummary = { hasRecord: boolean; totalObligation: number; remainingAmount: number; status: string };
type CashAdvanceSummaryData = { activeCount: number; totalRemaining: number };
type Action = "clock-in" | "clock-out";
type ApiBody = { success?: boolean; data?: unknown; error?: { code?: string } };

const safeErrors: Record<string, string> = {
  ATTENDANCE_LOCATION_NOT_CONFIGURED: "Lokasi absensi belum dikonfigurasi.",
  OUTSIDE_ATTENDANCE_RADIUS: "Anda berada di luar radius absensi.",
  LOCATION_ACCURACY_TOO_LOW: "Akurasi lokasi terlalu rendah. Aktifkan GPS presisi lalu coba lagi.",
  ALREADY_CLOCKED_IN: "Clock In hari ini sudah tercatat.",
  ALREADY_CLOCKED_OUT: "Clock Out hari ini sudah tercatat.",
  CLOCK_IN_REQUIRED: "Clock In wajib dilakukan terlebih dahulu.",
  UNAUTHORIZED: "Session berakhir. Silakan login kembali.",
  TEAM_CONTEXT_FORBIDDEN: "Akun Team tidak memiliki akses profil yang valid.",
  FORBIDDEN: "Akses tidak diizinkan.",
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: ApiBody | null = null;
  try { body = text ? (JSON.parse(text) as ApiBody) : null; } catch { body = null; }
  if (!response.ok || !body?.success) throw new Error(safeErrors[body?.error?.code ?? ""] ?? "Permintaan gagal. Silakan coba kembali.");
  return body;
}

function time(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
}

function formatRupiah(value?: number | null) {
  const num = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

export function TeamHomeClient({ employeeName, outletCode }: { employeeName: string; outletCode: string }) {
  const [today, setToday] = useState<TodayData | null>(null);
  const [division, setDivision] = useState("Memuat divisi…");
  const [latestLeave, setLatestLeave] = useState<LeaveSummary | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummaryData | null>(null);
  const [settlementSummary, setSettlementSummary] = useState<OperationalSettlementSummary | null>(null);
  const [cashAdvanceSummary, setCashAdvanceSummary] = useState<CashAdvanceSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const errors: string[] = [];
    await Promise.all([
      requestJson("/api/team/attendance/today")
        .then((res) => setToday(res.data as TodayData))
        .catch((cause) => { errors.push(cause instanceof Error ? cause.message : "Absensi gagal dimuat."); }),
      requestJson("/api/team/profile")
        .then((res) => {
          const div = (res.data as ProfileData)?.division;
          if (div) setDivision(div);
          else setDivision("Divisi tidak terdaftar");
        })
        .catch((cause) => {
          setDivision("Divisi tidak tersedia");
          errors.push(cause instanceof Error ? cause.message : "Profil gagal dimuat.");
        }),
      requestJson("/api/team/delivery-summary")
        .then((res) => setDeliverySummary((res.data as DeliverySummaryData) ?? null))
        .catch(() => setDeliverySummary(null)),
      requestJson("/api/team/operational")
        .then((res) => {
          const opData = res.data as { settlement?: OperationalSettlementSummary };
          if (opData?.settlement) setSettlementSummary(opData.settlement);
          else setSettlementSummary(null);
        })
        .catch(() => setSettlementSummary(null)),
      requestJson("/api/team/cash-advance")
        .then((res) => {
          const summary = (res.data as { summary?: CashAdvanceSummaryData })?.summary;
          setCashAdvanceSummary(summary ?? null);
        })
        .catch(() => setCashAdvanceSummary(null)),
      requestJson("/api/team/leave?page=1&pageSize=1")
        .then((res) => setLatestLeave(((res as { data?: LeaveSummary[] }).data ?? [])[0] ?? null))
        .catch(() => {
          // Leave summary error can fail gracefully
        }),
    ]);
    if (errors.length > 0) setError(errors[0]);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function submit(selected: Action) {
    if (submitting) return;
    setSubmitting(true); setError(""); setAction(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }));
      await requestJson(`/api/team/attendance/${selected}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString(), idempotencyKey: crypto.randomUUID() }),
      });
      await load();
    } catch (cause) {
      const geolocationError = typeof cause === "object" && cause !== null && "code" in cause && "message" in cause;
      setError(geolocationError ? "Lokasi tidak dapat diambil. Periksa izin GPS browser." : cause instanceof Error ? cause.message : "Absensi gagal disimpan.");
    } finally { setSubmitting(false); }
  }

  const locationReady = Boolean(today?.location.configured && today.location.active);
  const checkedIn = Boolean(today?.attendance?.checkInAt);
  const checkedOut = Boolean(today?.attendance?.checkOutAt);

  const deliveryVal = deliverySummary ? String(deliverySummary.deliveryToday) : undefined;
  const ttdVal = deliverySummary ? String(deliverySummary.totalTtd) : undefined;
  const pendingVal = deliverySummary ? String(deliverySummary.pending) : undefined;
  const achievementVal = deliverySummary ? `${deliverySummary.achievement.toFixed(2)}%` : undefined;

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Dashboard Pribadi</p>
        <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-slate-950">{employeeName}</h1>
        <p className="mt-0.5 text-sm font-semibold text-slate-500">{division} · Outlet {outletCode}</p>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

      {/* 2. Card Absensi Hari Ini */}
      <section className="overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0f2b5b] via-blue-800 to-blue-600 p-5 text-white shadow-[0_18px_45px_rgba(30,64,175,0.24)]">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Absensi Hari Ini</p><p className="mt-2 text-xl font-black">{loading ? "Memuat…" : today?.attendance?.status ?? "Belum Absen"}</p><p className="mt-1 text-xs text-blue-100">{today?.businessDate ?? "—"}</p></div>
          <span className="grid size-12 place-items-center rounded-2xl bg-white/12"><Clock3 size={24} /></span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-blue-100">Jam Masuk</p><p className="mt-1 text-xl font-black">{time(today?.attendance?.checkInAt)}</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs text-blue-100">Jam Pulang</p><p className="mt-1 text-xl font-black">{time(today?.attendance?.checkOutAt)}</p></div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-950/15 p-3 text-xs leading-5 text-blue-50"><MapPin size={17} className="mt-0.5 shrink-0" /><span>{locationReady ? `Lokasi aktif · radius ${today?.location.radiusMeters ?? "—"} meter` : "Lokasi absensi belum dikonfigurasi. Hubungi Admin untuk mengatur lokasi absensi."}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" disabled={loading || submitting || checkedIn || !locationReady} onClick={() => setAction("clock-in")} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-extrabold text-blue-700 transition active:scale-[0.98] disabled:opacity-45"><LogIn size={18} />Clock In</button>
          <button type="button" disabled={loading || submitting || !checkedIn || checkedOut || !locationReady} onClick={() => setAction("clock-out")} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-3 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:opacity-45"><LogOut size={18} />Clock Out</button>
        </div>
      </section>

      {/* 3. Card Settlement Hari Ini */}
      <section>
        <Link
          href="/team/delivery?tab=settlement"
          className="block overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.03)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <CreditCard size={18} />
              </span>
              <h2 className="text-sm font-extrabold text-slate-950">Settlement Hari Ini</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {loading ? (
                <span className="text-xs font-semibold text-slate-400">Memuat…</span>
              ) : settlementSummary ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                    settlementSummary.status === "SELESAI"
                      ? "bg-emerald-100 text-emerald-800"
                      : settlementSummary.status === "SEBAGIAN"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {settlementSummary.status === "SELESAI"
                    ? "LUNAS / SELESAI"
                    : settlementSummary.status === "SEBAGIAN"
                    ? "BELUM LUNAS"
                    : "BELUM SETOR"}
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-400">Tidak ada kewajiban</span>
              )}
              <ArrowRight size={16} className="text-slate-400" />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-2.5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Kewajiban</p>
              <p className="mt-0.5 truncate text-sm font-black text-slate-900">
                {loading ? "Memuat…" : settlementSummary ? formatRupiah(settlementSummary.totalObligation) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Sisa Setoran</p>
              <p className="mt-0.5 truncate text-sm font-black text-amber-900">
                {loading ? "Memuat…" : settlementSummary ? formatRupiah(settlementSummary.remainingAmount) : "—"}
              </p>
            </div>
          </div>
        </Link>
      </section>

      {/* 4. Card Kasbon Saya */}
      <section>
        <Link
          href="/team/cash-advance"
          className="block overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.03)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <HandCoins size={18} />
              </span>
              <h2 className="text-sm font-extrabold text-slate-950">Kasbon Saya</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {loading ? (
                <span className="text-xs font-semibold text-slate-400">Memuat…</span>
              ) : cashAdvanceSummary ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                    cashAdvanceSummary.activeCount > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {cashAdvanceSummary.activeCount > 0
                    ? `${cashAdvanceSummary.activeCount} AKTIF`
                    : "TIDAK ADA AKTIF"}
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-400">Tidak ada kasbon</span>
              )}
              <ArrowRight size={16} className="text-slate-400" />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-2.5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Sisa Kasbon</p>
              <p className="mt-0.5 truncate text-sm font-black text-amber-900">
                {loading ? "Memuat…" : cashAdvanceSummary ? formatRupiah(cashAdvanceSummary.totalRemaining) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Kasbon Aktif</p>
              <p className="mt-0.5 truncate text-sm font-black text-slate-900">
                {loading ? "Memuat…" : cashAdvanceSummary ? `${cashAdvanceSummary.activeCount} record` : "0"}
              </p>
            </div>
          </div>
        </Link>
      </section>

      {/* 5. Card Ringkasan Hari Ini (SINGLE OUTER CARD 2x2 GRID) */}
      <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.03)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h2 className="text-sm font-extrabold text-slate-950">Ringkasan Hari Ini</h2>
          <span className="text-xs font-semibold text-blue-600">{deliverySummary?.businessDate ?? "Hari Ini"}</span>
        </div>

        <div className="grid grid-cols-2 gap-y-3.5 gap-x-3 text-xs">
          {/* Row 1: Delivery Hari Ini & TTD */}
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-1.5 text-slate-500">
              <PackageCheck size={16} className="shrink-0 text-blue-600" />
              <span className="truncate font-bold text-[11px]">Delivery Hari Ini</span>
            </div>
            <p className="mt-1 truncate text-base font-black text-slate-900">
              {loading ? "Memuat…" : deliveryVal ?? "Belum tersedia"}
            </p>
          </div>

          <div className="min-w-0 border-l border-slate-100 pl-3">
            <div className="flex items-center gap-1.5 text-slate-500">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              <span className="truncate font-bold text-[11px]">TTD</span>
            </div>
            <p className="mt-1 truncate text-base font-black text-slate-900">
              {loading ? "Memuat…" : ttdVal ?? "Belum tersedia"}
            </p>
          </div>

          {/* Row 2: Pending & Achievement */}
          <div className="min-w-0 pr-1 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1.5 text-slate-500">
              <TimerReset size={16} className="shrink-0 text-amber-600" />
              <span className="truncate font-bold text-[11px]">Pending</span>
            </div>
            <p className="mt-1 truncate text-base font-black text-slate-900">
              {loading ? "Memuat…" : pendingVal ?? "Belum tersedia"}
            </p>
          </div>

          <div className="min-w-0 border-l border-t border-slate-100 pl-3 pt-3">
            <div className="flex items-center gap-1.5 text-slate-500">
              <TrendingUp size={16} className="shrink-0 text-blue-600" />
              <span className="truncate font-bold text-[11px]">Achievement</span>
            </div>
            <p className="mt-1 truncate text-base font-black text-slate-900">
              {loading ? "Memuat…" : achievementVal ?? "Belum tersedia"}
            </p>
          </div>
        </div>

        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] font-semibold leading-4 text-slate-400">
          Data pribadi berdasarkan Monitoring Harian kurir login.
        </p>
      </section>

      {/* 6. Aksi Cepat */}
      <section>
        <h2 className="mb-2.5 text-sm font-extrabold text-slate-950">Aksi Cepat</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <QuickLink href="/team/leave?type=LEAVE" icon={CalendarPlus} label="Ajukan Cuti" />
          <QuickLink href="/team/leave?type=PERMISSION" icon={Clock3} label="Ajukan Izin" />
          <QuickLink href="/team/leave?type=SICK" icon={Stethoscope} label="Ajukan Sakit" />
        </div>
      </section>

      <section>
        <InfoCard href="/team/leave" title="Pengajuan Saya" description={latestLeave ? `${{ LEAVE: "Cuti", PERMISSION: "Izin", SICK: "Sakit" }[latestLeave.type]} · ${latestLeave.startDate} · ${{ PENDING: "Pending", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan" }[latestLeave.status]}` : "Belum ada pengajuan. Lihat Pengajuan"} />
      </section>

      {action && <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 p-3 sm:items-center sm:justify-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="attendance-confirm-title" className="w-full rounded-[24px] bg-white p-5 shadow-2xl sm:max-w-sm"><h2 id="attendance-confirm-title" className="text-lg font-black text-slate-950">Konfirmasi {action === "clock-in" ? "Clock In" : "Clock Out"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Lokasi GPS hanya diambil setelah Anda menekan Lanjutkan.</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setAction(null)} className="min-h-11 rounded-xl border border-slate-200 font-bold text-slate-700">Batal</button><button type="button" onClick={() => void submit(action)} className="min-h-11 rounded-xl bg-blue-600 font-bold text-white">Lanjutkan</button></div></section></div>}
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof CalendarPlus; label: string }) {
  return <Link href={href} className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-[18px] border border-slate-200 bg-white p-2 text-center text-xs font-bold text-slate-700 shadow-[0_4px_16px_rgba(15,23,42,0.03)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon size={18} /></span><span className="w-full truncate">{label}</span></Link>;
}

function InfoCard({ href, title, description, icon }: { href: string; title: string; description: string; icon?: React.ReactNode }) {
  return <Link href={href} className="flex min-h-24 items-center gap-3.5 rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.03)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">{icon ?? <CalendarPlus size={20} />}</span><span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold text-slate-950">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span></span><ArrowRight size={18} className="shrink-0 text-slate-400" /></Link>;
}

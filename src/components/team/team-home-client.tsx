"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarPlus, CheckCircle2, Clock3, HandCoins, LogIn, LogOut, MapPin, PackageCheck, Stethoscope, TimerReset, TrendingUp } from "lucide-react";

type Attendance = { id: string; status: string; checkInAt: string | null; checkOutAt: string | null };
type TodayData = { businessDate: string; attendance: Attendance | null; location: { configured: boolean; active: boolean; radiusMeters: number | null } };
type ProfileData = { division: string };
type Action = "clock-in" | "clock-out";
type ApiBody = { success?: boolean; data?: unknown; error?: { code?: string } };

const safeErrors: Record<string, string> = {
  ATTENDANCE_LOCATION_NOT_CONFIGURED: "Lokasi absensi belum dikonfigurasi.",
  OUTSIDE_ATTENDANCE_RADIUS: "Anda berada di luar radius absensi.",
  LOCATION_ACCURACY_TOO_LOW: "Akurasi lokasi terlalu rendah. Aktifkan GPS presisi lalu coba lagi.",
  ALREADY_CLOCKED_IN: "Clock In hari ini sudah tercatat.",
  ALREADY_CLOCKED_OUT: "Clock Out hari ini sudah tercatat.",
  CLOCK_IN_REQUIRED: "Clock In wajib dilakukan terlebih dahulu.",
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const text = await response.text();
  let body: ApiBody | null = null;
  try { body = text ? JSON.parse(text) as ApiBody : null; } catch { body = null; }
  if (!response.ok || !body?.success) throw new Error(safeErrors[body?.error?.code ?? ""] ?? "Permintaan gagal. Silakan coba kembali.");
  return body;
}

function time(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
}

export function TeamHomeClient({ employeeName, outletCode }: { employeeName: string; outletCode: string }) {
  const [today, setToday] = useState<TodayData | null>(null);
  const [division, setDivision] = useState("Memuat divisi…");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [attendance, profile] = await Promise.all([requestJson("/api/team/attendance/today"), requestJson("/api/team/profile")]);
      setToday(attendance.data as TodayData);
      setDivision((profile.data as ProfileData).division);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dashboard gagal dimuat."); }
    finally { setLoading(false); }
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

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Dashboard Pribadi</p>
        <h1 className="mt-1.5 truncate text-2xl font-black tracking-tight text-slate-950">{employeeName}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">{division} · Outlet {outletCode}</p>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}

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

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-extrabold text-slate-950">Ringkasan Hari Ini</h2><span className="text-xs font-semibold text-slate-400">Belum tersedia</span></div>
        <div className="grid grid-cols-2 gap-3">
          <Metric icon={PackageCheck} label="Delivery Hari Ini" />
          <Metric icon={CheckCircle2} label="TTD" />
          <Metric icon={TimerReset} label="Pending" />
          <Metric icon={TrendingUp} label="Achievement" />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Data pribadi akan ditampilkan setelah mapping kurir tervalidasi. Tidak ada data outlet global yang digunakan.</p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-extrabold text-slate-950">Aksi Cepat</h2>
        <div className="grid grid-cols-3 gap-3">
          <QuickLink href="/team/leave" icon={CalendarPlus} label="Ajukan Cuti" />
          <QuickLink href="/team/leave" icon={Clock3} label="Ajukan Izin" />
          <QuickLink href="/team/leave" icon={Stethoscope} label="Ajukan Sakit" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <InfoCard href="/team/leave" title="Pengajuan" description="Cuti, izin, dan sakit sedang dipersiapkan." />
        <InfoCard href="/team/cash-advance" title="Kasbon Saya" description="Data kasbon pribadi belum tersedia." icon={<HandCoins size={21} />} />
      </section>

      {action && <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 p-3 sm:items-center sm:justify-center" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="attendance-confirm-title" className="w-full rounded-[24px] bg-white p-5 shadow-2xl sm:max-w-sm"><h2 id="attendance-confirm-title" className="text-lg font-black text-slate-950">Konfirmasi {action === "clock-in" ? "Clock In" : "Clock Out"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Lokasi GPS hanya diambil setelah Anda menekan Lanjutkan.</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setAction(null)} className="min-h-11 rounded-xl border border-slate-200 font-bold text-slate-700">Batal</button><button type="button" onClick={() => void submit(action)} className="min-h-11 rounded-xl bg-blue-600 font-bold text-white">Lanjutkan</button></div></section></div>}
    </div>
  );
}

function Metric({ icon: Icon, label }: { icon: typeof PackageCheck; label: string }) {
  return <div className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"><span className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={20} /></span><p className="mt-3 text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-sm font-extrabold text-slate-900">Belum tersedia</p></div>;
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof CalendarPlus; label: string }) {
  return <Link href={href} className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white p-2 text-center text-xs font-bold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={19} /></span><span>{label}</span></Link>;
}

function InfoCard({ href, title, description, icon }: { href: string; title: string; description: string; icon?: React.ReactNode }) {
  return <Link href={href} className="flex min-h-28 items-center gap-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700">{icon ?? <CalendarPlus size={21} />}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-950">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span><ArrowRight size={18} className="shrink-0 text-slate-400" /></Link>;
}

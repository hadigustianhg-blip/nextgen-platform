"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { UserAvatar } from "@/components/ui";

type Profile = { name: string; division: string; outletCode: string; username: string; accountStatus: string; avatarUrl: string };
type ApiResult = { success?: boolean; data?: Profile; error?: { code?: string } };

const safeErrors: Record<string, string> = {
  CURRENT_PASSWORD_INVALID: "Password saat ini tidak benar.",
  PASSWORD_UNCHANGED: "Password baru harus berbeda dari password saat ini.",
  VALIDATION_ERROR: "Periksa kembali password yang Anda masukkan.",
  UNAUTHORIZED: "Session berakhir. Silakan login kembali.",
  TEAM_CONTEXT_FORBIDDEN: "Akun Team tidak memiliki akses profil yang valid.",
};

async function apiRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  const text = await response.text();
  let result: ApiResult | null = null;
  try { result = text ? JSON.parse(text) as ApiResult : null; } catch { result = null; }
  if (!response.ok || !result?.success) throw new Error(safeErrors[result?.error?.code ?? ""] ?? "Permintaan profil gagal. Silakan coba kembali.");
  return result;
}
export function TeamProfileClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest("/api/team/profile").then((result) => setProfile(result.data ?? null)).catch((cause) => setError(cause instanceof Error ? cause.message : "Profil gagal dimuat.")).finally(() => setLoading(false));
  }, []);

  async function changePassword() {
    if (saving) return;
    if (!currentPassword || password.length < 10 || password.length > 128 || password !== confirmPassword) {
      setError(password !== confirmPassword ? "Konfirmasi password baru tidak sama." : "Password baru harus terdiri dari 10–128 karakter.");
      return;
    }
    if (currentPassword === password) { setError("Password baru harus berbeda dari password saat ini."); return; }
    setSaving(true); setError("");
    try {
      await apiRequest("/api/team/profile/change-password", { method: "POST", body: JSON.stringify({ currentPassword, password, confirmPassword }) });
      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password gagal diubah."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <header><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Akun Team</p><h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">Profil Saya</h1><p className="mt-2 text-sm leading-6 text-slate-600">Identitas akun pribadi dan pengaturan keamanan.</p></header>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
        {loading ? <div className="animate-pulse space-y-4" aria-label="Memuat profil"><div className="mx-auto size-24 rounded-[24px] bg-slate-100"/><div className="mx-auto h-5 w-40 rounded bg-slate-100"/><div className="h-32 rounded-2xl bg-slate-100"/></div> : profile ? <>
          <div className="text-center"><UserAvatar name={profile.name} src={profile.avatarUrl} className="mx-auto size-24 rounded-[24px]"/><h2 className="mt-3 text-xl font-black text-slate-950">{profile.name}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{profile.division}</p><span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{profile.accountStatus}</span></div>
          <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm"><ProfileRow label="Username" value={profile.username}/><ProfileRow label="Outlet" value={profile.outletCode}/><ProfileRow label="Status Akun" value={profile.accountStatus}/></dl>
        </> : <div className="py-8 text-center"><UserRound className="mx-auto text-slate-400"/><p className="mt-3 text-sm text-slate-600">Profil tidak dapat dimuat.</p></div>}
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ShieldCheck size={21}/></span><div><h2 className="font-extrabold text-slate-950">Ubah Password</h2><p className="text-xs leading-5 text-slate-500">Minimal 10 karakter.</p></div></div>
        <div className="mt-5 space-y-4">
          <PasswordField label="Password Saat Ini" value={currentPassword} onChange={setCurrentPassword} visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} autoComplete="current-password"/>
          <PasswordField label="Password Baru" value={password} onChange={setPassword} visible={showNew} onToggle={() => setShowNew((value) => !value)} autoComplete="new-password"/>
          <PasswordField label="Konfirmasi Password Baru" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} autoComplete="new-password"/>
        </div>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <button type="button" disabled={saving} onClick={() => void changePassword()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50"><KeyRound size={18}/>{saving ? "Mengubah…" : "Ubah Password"}</button>
      </section>

      <form action="/api/auth/logout" method="post">
        <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 shadow-sm"><LogOut size={18}/>Keluar dari Akun</button>
      </form>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">{label}</dt><dd className="break-all text-right font-bold text-slate-900">{value}</dd></div>; }

function PasswordField({ label, value, onChange, visible, onToggle, autoComplete }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void; autoComplete: string }) {
  return <label className="block text-sm font-bold text-slate-700"><span className="mb-1.5 block">{label}</span><span className="relative block"><input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={label === "Password Saat Ini" ? undefined : 10} maxLength={128} className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/><button type="button" onClick={onToggle} aria-label={visible ? "Sembunyikan password" : "Tampilkan password"} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{visible ? <EyeOff size={19}/> : <Eye size={19}/>}</button></span></label>;
}

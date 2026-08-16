"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, EyeOff, KeyRound, Save, ShieldCheck, Upload } from "lucide-react";
import { AppCard, PageHeader, UserAvatar, nextgenButtonClass, nextgenControlClass } from "@/components/ui";

export type OwnProfileView = {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  tenantName: string;
  outlet: { id: string; code: string; name: string } | null;
  roles: Array<{ code: string; name: string }>;
  avatarUrl: string;
  avatarUpdatedAt: string | null;
  avatarUploadAvailable: boolean;
};

type ApiResult = { success?: boolean; data?: OwnProfileView; error?: { code?: string; fieldErrors?: Record<string, string[]> } };

const errorMessages: Record<string, string> = {
  CURRENT_PASSWORD_INVALID: "Password saat ini tidak benar.",
  PASSWORD_UNCHANGED: "Password baru harus berbeda dari password saat ini.",
  VALIDATION_ERROR: "Periksa kembali data yang Anda masukkan.",
  UNAUTHORIZED: "Session berakhir. Silakan login kembali.",
  FORBIDDEN: "Anda tidak memiliki izin untuk mengubah profil.",
  PROFILE_REQUEST_FAILED: "Profil gagal diperbarui. Silakan coba kembali.",
  AVATAR_TYPE_INVALID: "Gunakan file JPEG, PNG, atau WebP.",
  AVATAR_SIZE_INVALID: "Ukuran foto harus maksimal 5 MB.",
  AVATAR_DIMENSIONS_INVALID: "Dimensi foto maksimal 4096 × 4096 piksel.",
  AVATAR_ANIMATED_NOT_ALLOWED: "Foto animasi tidak didukung.",
  AVATAR_IMAGE_INVALID: "File tidak dapat dikenali sebagai gambar yang valid.",
  AVATAR_STORAGE_NOT_CONFIGURED: "Penyimpanan avatar belum dikonfigurasi.",
};

async function profileRequest(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const text = await response.text();
  let result: ApiResult | null = null;
  try { result = text ? JSON.parse(text) as ApiResult : null; } catch { result = null; }
  if (!response.ok || !result?.success) {
    throw new Error(errorMessages[result?.error?.code ?? ""] ?? "Permintaan profil gagal. Silakan coba kembali.");
  }
  return result;
}

function PasswordInput({ label, value, visible, onChange, onToggle, autoComplete }: {
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={label === "Password Saat Ini" ? undefined : 10}
          maxLength={128}
          className={`${nextgenControlClass} w-full pr-12`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-slate-500 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

export function ProfileClient({ initialProfile }: { initialProfile: OwnProfileView }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [name, setName] = useState(initialProfile.name);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");
  const [nameError, setNameError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  function selectAvatar(file: File | undefined) {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarMessage("");
    setAvatarError("");
    if (!file) {
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarError(file.size > 5 * 1024 * 1024 ? errorMessages.AVATAR_SIZE_INVALID : errorMessages.AVATAR_TYPE_INVALID);
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar() {
    if (!avatarFile || uploadingAvatar) return;
    setUploadingAvatar(true); setAvatarError(""); setAvatarMessage("");
    try {
      const form = new FormData();
      form.set("avatar", avatarFile);
      const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as ApiResult | null;
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(errorMessages[result?.error?.code ?? ""] ?? "Foto profil gagal disimpan.");
      }
      setProfile(result.data);
      setAvatarFile(null);
      setAvatarPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setAvatarMessage("Foto profil berhasil diperbarui.");
      router.refresh();
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Foto profil gagal disimpan.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveName() {
    if (savingName) return;
    const normalized = name.trim().replace(/\s+/g, " ");
    if (normalized.length < 2 || normalized.length > 120) {
      setNameError("Nama lengkap harus terdiri dari 2–120 karakter.");
      return;
    }
    setSavingName(true); setNameError(""); setNameMessage("");
    try {
      const result = await profileRequest("/api/profile", { method: "PATCH", body: JSON.stringify({ name: normalized }) });
      if (result.data) { setProfile(result.data); setName(result.data.name); }
      setNameMessage("Nama profil berhasil diperbarui.");
      router.refresh();
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "Profil gagal diperbarui.");
    } finally { setSavingName(false); }
  }

  async function changePassword() {
    if (savingPassword) return;
    if (!currentPassword || password.length < 10 || password.length > 128 || password !== confirmPassword) {
      setPasswordError(password !== confirmPassword ? "Konfirmasi password baru tidak sama." : "Password baru harus terdiri dari 10–128 karakter.");
      return;
    }
    if (currentPassword === password) {
      setPasswordError("Password baru harus berbeda dari password saat ini.");
      return;
    }
    setSavingPassword(true); setPasswordError("");
    try {
      await profileRequest("/api/profile/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });
      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Password gagal diubah.");
    } finally { setSavingPassword(false); }
  }

  const lastLogin = profile.lastLoginAt
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(profile.lastLoginAt))
    : "Belum tercatat";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Akun" title="Profil Saya" description="Kelola identitas akun dan keamanan Anda sendiri." />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <AppCard className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              <UserAvatar name={profile.name} src={avatarPreview ?? profile.avatarUrl} className="size-24 rounded-2xl" />
              <span className="absolute -bottom-2 -right-2 grid size-8 place-items-center rounded-full bg-blue-600 text-white ring-4 ring-white" aria-hidden="true"><Camera size={15} /></span>
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-slate-950">{profile.name}</h2>
              <p className="mt-1 text-sm text-slate-500">JPEG, PNG, atau WebP · maksimal 5 MB</p>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => selectAvatar(event.target.files?.[0])} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!profile.avatarUploadAvailable || uploadingAvatar} onClick={() => fileInputRef.current?.click()} className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
                  <Camera size={16} aria-hidden="true" /> Ganti Foto
                </button>
                {avatarFile && <button type="button" disabled={uploadingAvatar} onClick={() => void uploadAvatar()} className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700`}><Upload size={16} aria-hidden="true" /> {uploadingAvatar ? "Mengunggah..." : "Simpan Foto"}</button>}
              </div>
              {!profile.avatarUploadAvailable && <p className="mt-2 text-xs text-amber-700">Penyimpanan avatar belum dikonfigurasi.</p>}
              <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{profile.status === "ACTIVE" ? "Aktif" : profile.status}</span>
            </div>
          </div>
          {avatarMessage && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{avatarMessage}</p>}
          {avatarError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{avatarError}</p>}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Nama Lengkap
              <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className={`${nextgenControlClass} mt-1.5 w-full`} />
            </label>
            <ReadOnlyField label="Email / Username" value={profile.email} />
            <ReadOnlyField label="Role" value={profile.roles.map((role) => role.name).join(", ") || "—"} />
            <ReadOnlyField label="Tenant" value={profile.tenantName || "Tenant"} />
            <ReadOnlyField label="Outlet" value={profile.outlet ? `${profile.outlet.code} · ${profile.outlet.name}` : "Tidak terikat outlet"} />
            <ReadOnlyField label="Status Akun" value={profile.status === "ACTIVE" ? "Aktif" : profile.status} />
            <ReadOnlyField label="Login Terakhir" value={lastLogin} />
          </div>
          {nameMessage && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{nameMessage}</p>}
          {nameError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{nameError}</p>}
          <div className="mt-5 flex justify-end">
            <button type="button" disabled={savingName || name.trim() === profile.name} onClick={() => void saveName()} className={`${nextgenButtonClass} bg-blue-600 text-white hover:bg-blue-700`}>
              <Save size={17} aria-hidden="true" /> {savingName ? "Menyimpan..." : "Simpan Nama"}
            </button>
          </div>
        </AppCard>

        <AppCard className="p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck size={21} /></span><div><h2 className="font-bold text-slate-950">Keamanan</h2><p className="text-sm text-slate-500">Ubah password akun Anda.</p></div></div>
          <div className="mt-5 space-y-4">
            <PasswordInput label="Password Saat Ini" value={currentPassword} visible={showCurrent} onChange={setCurrentPassword} onToggle={() => setShowCurrent((value) => !value)} autoComplete="current-password" />
            <PasswordInput label="Password Baru" value={password} visible={showNew} onChange={setPassword} onToggle={() => setShowNew((value) => !value)} autoComplete="new-password" />
            <PasswordInput label="Konfirmasi Password Baru" value={confirmPassword} visible={showConfirm} onChange={setConfirmPassword} onToggle={() => setShowConfirm((value) => !value)} autoComplete="new-password" />
            <p className="text-xs leading-5 text-slate-500">Gunakan 10–128 karakter. Setelah berhasil, seluruh session akun ini dicabut dan Anda perlu login kembali.</p>
          </div>
          {passwordError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{passwordError}</p>}
          <button type="button" disabled={savingPassword} onClick={() => void changePassword()} className={`${nextgenButtonClass} mt-5 w-full bg-slate-950 text-white hover:bg-slate-800`}>
            <KeyRound size={17} aria-hidden="true" /> {savingPassword ? "Mengubah..." : "Ubah Password"}
          </button>
        </AppCard>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p></div>;
}

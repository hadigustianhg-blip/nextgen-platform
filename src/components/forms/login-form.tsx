"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Network } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenant: "nextgen-demo", email: "owner@nextgen.local", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as { data?: { redirectTo: string }; error?: { message: string } };
    if (!response.ok || !payload.data) {
      setServerError(payload.error?.message ?? "Login gagal. Silakan coba kembali.");
      return;
    }
    router.replace(payload.data.redirectTo);
    router.refresh();
  }

  const fieldClass =
    "h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Tenant</span>
        <span className="relative block">
          <Network className="absolute left-4 top-3.5 text-slate-400" size={19} />
          <input {...register("tenant")} className={fieldClass} autoComplete="organization" placeholder="nextgen-demo" />
        </span>
        {errors.tenant && <span className="mt-1.5 block text-xs text-red-600">{errors.tenant.message}</span>}
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
        <span className="relative block">
          <Mail className="absolute left-4 top-3.5 text-slate-400" size={19} />
          <input {...register("email")} type="email" className={fieldClass} autoComplete="email" placeholder="nama@perusahaan.com" />
        </span>
        {errors.email && <span className="mt-1.5 block text-xs text-red-600">{errors.email.message}</span>}
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
        <span className="relative block">
          <LockKeyhole className="absolute left-4 top-3.5 text-slate-400" size={19} />
          <input {...register("password")} type={showPassword ? "text" : "password"} className={`${fieldClass} pr-12`} autoComplete="current-password" placeholder="Masukkan password" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-700">
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </span>
        {errors.password && <span className="mt-1.5 block text-xs text-red-600">{errors.password.message}</span>}
      </label>
      {serverError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>}
      <button disabled={isSubmitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70">
        {isSubmitting && <LoaderCircle size={18} className="animate-spin" />}
        {isSubmitting ? "Memverifikasi..." : "Masuk ke NEXTGEN"}
      </button>
    </form>
  );
}

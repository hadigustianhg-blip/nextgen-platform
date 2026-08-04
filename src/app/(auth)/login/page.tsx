import { redirect } from "next/navigation";
import { Boxes, CheckCircle2, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/forms/login-form";
import { NextgenBrand } from "@/components/ui";
import { getAnySession, isTeamSession } from "@/lib/auth/session";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  const session = await getAnySession();
  if (session) redirect(isTeamSession(session) ? "/team" : "/dashboard");

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#0b1739] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 size-80 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative">
          <NextgenBrand variant="light" className="h-12 w-auto max-w-[210px]" priority />
          <div className="mt-24 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">Satu pusat kendali</p>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.12] tracking-tight">Operasional lebih cepat, rapi, dan terukur.</h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">Pantau pickup, delivery, settlement, dan performa outlet dalam satu sistem yang aman.</p>
          </div>
        </div>
        <div className="relative grid grid-cols-3 gap-3">
          {[
            [ShieldCheck, "Akses aman"],
            [Boxes, "Multi-outlet"],
            [CheckCircle2, "Data terukur"],
          ].map(([Icon, label]) => {
            const FeatureIcon = Icon as typeof ShieldCheck;
            return (
              <div key={label as string} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <FeatureIcon size={20} className="text-blue-300" />
                <p className="mt-3 text-sm font-semibold">{label as string}</p>
              </div>
            );
          })}
        </div>
      </section>
      <section className="flex items-center justify-center bg-[#f7f9fc] px-5 py-12">
        <div className="w-full max-w-[440px] rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-10">
          <div className="mb-8 lg:hidden">
            <NextgenBrand variant="dark" className="h-10 w-auto max-w-[180px]" priority />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Selamat datang kembali</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Masuk ke akun Anda</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Gunakan tenant dan akun yang diberikan administrator.</p>
          <LoginForm />
          <p className="mt-7 text-center text-xs text-slate-400">NEXTGEN Operations System · Secure workspace</p>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

const items = [
  ["Profil Bisnis", "/dashboard/settings/business-profile"],
  ["User & Hak Akses", "/dashboard/settings/users"],
  ["Finance", "/dashboard/settings/finance"],
  ["Integrasi", "/dashboard/settings/integrations"],
  ["Maintenance", "/dashboard/settings/maintenance"],
  ["Audit Log", "/dashboard/settings/audit-logs"],
] as const;

export function SettingsShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="space-y-6">
    <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Pengaturan</p><h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p></header>
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2" aria-label="Submenu Pengaturan">
      {items.map(([label, href]) => <Link key={href} href={href} className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">{label}</Link>)}
    </nav>
    {children}
  </div>;
}

export function SettingsCard({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-base font-bold text-slate-900">{title}</h2>{children}</section>; }
export const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
export const buttonClass = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

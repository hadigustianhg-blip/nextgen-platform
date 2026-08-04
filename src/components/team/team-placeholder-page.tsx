import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export function TeamPlaceholderPage({ eyebrow, title, description, options, icon: Icon, link }: {
  eyebrow: string;
  title: string;
  description: string;
  options?: string[];
  icon: LucideIcon;
  link?: { href: string; label: string };
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      </header>
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
        <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-blue-50 text-blue-700"><Icon size={30} aria-hidden="true" /></span>
        <h2 className="mt-5 text-lg font-extrabold text-slate-950">Fitur sedang dipersiapkan</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Tidak ada data dummy atau transaksi yang akan dibuat dari halaman ini.</p>
        {options && <div className="mt-5 grid gap-2.5 sm:grid-cols-3">{options.map((option) => <div key={option} className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{option}</div>)}</div>}
        {link && <Link href={link.href} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{link.label}<ArrowRight size={17} /></Link>}
      </section>
    </div>
  );
}

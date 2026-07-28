import { ArrowUpRight, CalendarDays, CircleDollarSign, ReceiptText, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { SlaChart } from "@/components/dashboard/sla-chart";
import { requireSession } from "@/lib/auth/session";
import { getDashboardSnapshot } from "@/modules/monitoring/dashboard.service";

const toneClasses = {
  navy: "bg-slate-900 text-white",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
} as const;

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const snapshot = await getDashboardSnapshot({
    tenantId: session.tenantId,
    outletId: session.outletId,
  });

  return (
    <AppShell session={session}>
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Operations overview</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Dashboard Operasional</h1>
            <p className="mt-2 text-sm text-slate-500">Ringkasan performa {session.tenantName} hari ini.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600 shadow-sm">
            <CalendarDays size={16} className="text-blue-600" />
            {snapshot.generatedAt}
          </div>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {snapshot.metrics.map((metric) => (
            <article key={metric.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className={`grid size-10 place-items-center rounded-xl ${toneClasses[metric.tone]}`}>
                  <metric.icon size={19} />
                </div>
                {metric.trend && <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{metric.trend}</span>}
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
              <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-900">{metric.value}</p>
              <p className="mt-1 text-xs text-slate-400">{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_0.75fr_0.75fr]">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Progress SLA</p>
                <p className="mt-1 text-xs text-slate-500">Target keseluruhan {snapshot.sla.target}%</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700">
                <Target size={17} /> {snapshot.sla.current}%
              </div>
            </div>
            <div className="mt-4">
              <SlaChart points={snapshot.sla.points} />
            </div>
          </article>
          <article className="relative overflow-hidden rounded-2xl bg-[#0b1739] p-6 text-white shadow-sm">
            <div className="absolute -right-8 -top-8 size-32 rounded-full bg-blue-500/20" />
            <CircleDollarSign className="text-blue-300" size={25} />
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">Total COD Cash</p>
            <p className="mt-2 text-2xl font-extrabold">{snapshot.codCash}</p>
            <p className="mt-2 flex items-center gap-1 text-xs text-slate-300">Rekonsiliasi hari ini <ArrowUpRight size={13} /></p>
          </article>
          <article className="relative overflow-hidden rounded-2xl bg-blue-600 p-6 text-white shadow-sm">
            <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/10" />
            <ReceiptText className="text-blue-100" size={25} />
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-blue-100">Resi Penjadwalan</p>
            <p className="mt-2 text-3xl font-extrabold">{snapshot.scheduledWaybills}</p>
            <p className="mt-2 flex items-center gap-1 text-xs text-blue-100">Menunggu proses delivery <ArrowUpRight size={13} /></p>
          </article>
        </section>
      </div>
    </AppShell>
  );
}

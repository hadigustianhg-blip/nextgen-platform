import { Suspense } from "react";
import { TeamCashAdvanceClient } from "@/components/team/team-cash-advance-client";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Kasbon Saya" };

export default async function TeamCashAdvancePage() {
  const team = await requireTeamContext();
  return (
    <Suspense fallback={<div className="p-4 text-center text-sm font-semibold text-slate-500">Memuat kasbon…</div>}>
      <TeamCashAdvanceClient employeeName={team.employeeName} outletCode={team.outletCode} />
    </Suspense>
  );
}

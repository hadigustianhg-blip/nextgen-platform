import { Suspense } from "react";
import { TeamDeliveryClient } from "@/components/team/team-delivery-client";
import { requireTeamContext } from "@/lib/auth/session";

export const metadata = { title: "Delivery Saya" };

export default async function TeamDeliveryPage() {
  const team = await requireTeamContext();
  return (
    <Suspense fallback={<div className="p-4 text-center text-sm font-semibold text-slate-500">Memuat operasional…</div>}>
      <TeamDeliveryClient employeeName={team.employeeName} outletCode={team.outletCode} />
    </Suspense>
  );
}

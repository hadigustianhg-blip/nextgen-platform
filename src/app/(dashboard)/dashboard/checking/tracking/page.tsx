import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { WaybillTrackingClient } from "@/components/checking/waybill-tracking-client";
import { requireSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { canViewProblemWaybillSensitive } from "@/modules/quality-control";

export const metadata = { title: "Tracking Resi" };

export default async function WaybillTrackingPage({
  searchParams,
}: {
  searchParams?: Promise<{ waybillNo?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  if (!canAccessResource(session.roles, "WAYBILL_TRACKING", "READ")) redirect("/dashboard");
  return <AppShell session={session}>
    {session.outletId
      ? <WaybillTrackingClient canRevealSensitive={canViewProblemWaybillSensitive(session)} initialWaybillNo={params?.waybillNo ?? ""} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif sebelum membuka Tracking Resi.</div>}
  </AppShell>;
}

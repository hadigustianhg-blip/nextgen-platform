import { AppShell } from "@/components/layout/app-shell";
import { PickupSchedulingClient } from "@/components/quality-control/pickup-scheduling-client";
import { requireSession } from "@/lib/auth/session";
import { canSyncPickupScheduling, canViewPickupSchedulingSensitive } from "@/modules/quality-control";

export const metadata = { title: "Penjadwalan Pickup" };

export default async function PickupSchedulingPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId
      ? <PickupSchedulingClient canSync={canSyncPickupScheduling(session)} canConfirm={canViewPickupSchedulingSensitive(session)} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif sebelum membuka Penjadwalan Pickup.</div>}
  </AppShell>;
}

import { AppShell } from "@/components/layout/app-shell";
import { WaybillStuckDeliveryClient } from "@/components/quality-control/waybill-stuck-delivery-client";
import { requireSession } from "@/lib/auth/session";
import { canSyncWaybillStuck } from "@/modules/quality-control";

export const metadata = { title: "Waybill Stuck Delivery" };

export default async function WaybillStuckDeliveryPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId
      ? <WaybillStuckDeliveryClient canSync={canSyncWaybillStuck(session)} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif sebelum membuka Waybill Stuck Delivery.</div>}
  </AppShell>;
}

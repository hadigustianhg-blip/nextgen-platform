import { AppShell } from "@/components/layout/app-shell";
import { DeliverySettlementClient } from "@/components/delivery-settlement/delivery-settlement-client";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Delivery Settlement" };

export default async function DeliverySettlementPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId && session.outletCode
      ? <DeliverySettlementClient outletCode={session.outletCode} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif sebelum membuka Delivery Settlement.</div>}
  </AppShell>;
}

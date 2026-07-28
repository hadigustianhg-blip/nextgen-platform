import { AppShell } from "@/components/layout/app-shell";
import { PickupSettlementClient } from "@/components/pickup/pickup-settlement-client";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Pickup Settlement" };

export default async function PickupSettlementPage() {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      {session.outletId && session.outletCode ? (
        <PickupSettlementClient outletCode={session.outletCode} />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Pilih outlet aktif sebelum membuka Pickup Settlement.
        </div>
      )}
    </AppShell>
  );
}

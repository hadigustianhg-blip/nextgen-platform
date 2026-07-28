import { AppShell } from "@/components/layout/app-shell";
import { MasterPickupClient } from "@/components/pickup/master-pickup-client";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Master Pickup" };

export default async function MasterPickupPage() {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      {session.outletId ? (
        <MasterPickupClient />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Pilih outlet aktif sebelum membuka Master Pickup.
        </div>
      )}
    </AppShell>
  );
}

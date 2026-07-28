import { AppShell } from "@/components/layout/app-shell";
import { RawPickupClient } from "@/components/pickup/raw-pickup-client";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "RAW Pickup" };

export default async function RawPickupPage() {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      {session.outletId && session.outletCode ? (
        <RawPickupClient outletCode={session.outletCode} />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Pilih outlet aktif sebelum membuka RAW Pickup.
        </div>
      )}
    </AppShell>
  );
}

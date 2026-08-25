import { PickupAdjustmentHelperClient } from "@/components/pickup/pickup-adjustment-helper-client";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Penyesuaian Pickup | NEXTGEN" };

export default async function PickupAdjustmentHelperPage({
  searchParams,
}: {
  searchParams: Promise<{ waybillNo?: string }>;
}) {
  await requireSession();
  const { waybillNo = "" } = await searchParams;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6">
      <PickupAdjustmentHelperClient waybillNo={waybillNo} />
    </main>
  );
}

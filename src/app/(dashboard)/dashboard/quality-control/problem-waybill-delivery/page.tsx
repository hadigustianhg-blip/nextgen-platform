import { AppShell } from "@/components/layout/app-shell";
import { ProblemWaybillDeliveryClient } from "@/components/quality-control/problem-waybill-delivery-client";
import { requireSession } from "@/lib/auth/session";
import {
  canSyncProblemWaybill,
  canViewProblemWaybillSensitive,
} from "@/modules/quality-control";

export const metadata = { title: "Problem Waybill Delivery" };

export default async function ProblemWaybillDeliveryPage() {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      {session.outletId ? (
        <ProblemWaybillDeliveryClient
          canSync={canSyncProblemWaybill(session)}
          canViewSensitive={canViewProblemWaybillSensitive(session)}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Pilih outlet aktif sebelum membuka Problem Waybill Delivery.
        </div>
      )}
    </AppShell>
  );
}

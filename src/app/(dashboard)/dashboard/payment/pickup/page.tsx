import { AppShell } from "@/components/layout/app-shell";
import { PickupPaymentClient } from "@/components/payment/pickup-payment-client";
import { requireSession } from "@/lib/auth/session";
import { canCreatePickupPayment, canManagePickupPayment } from "@/modules/payment";

export default async function PickupPaymentPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    <PickupPaymentClient
      canCreate={canCreatePickupPayment(session)}
      canManage={canManagePickupPayment(session)}
    />
  </AppShell>;
}


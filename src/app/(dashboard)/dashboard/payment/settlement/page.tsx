import { AppShell } from "@/components/layout/app-shell";
import { PaymentSettlementClient } from "@/components/payment/payment-settlement-client";
import { requireSession } from "@/lib/auth/session";

export default async function PaymentSettlementPage() {
  const session = await requireSession();
  return <AppShell session={session}><PaymentSettlementClient outletId={session.outletId!} /></AppShell>;
}


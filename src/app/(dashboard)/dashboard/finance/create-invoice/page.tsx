import { AppShell } from "@/components/layout/app-shell";
import { CreateInvoiceClient } from "@/components/finance/create-invoice-client";
import { requireSession } from "@/lib/auth/session";
import {
  canExportInvoice, canIssueInvoice, canMutateInvoice,
  canPrepareInvoiceWhatsapp, canVoidInvoice,
} from "@/modules/invoice";

export const metadata = { title: "Create Invoice" };

export default async function CreateInvoicePage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId
      ? <CreateInvoiceClient
          canCreate={canMutateInvoice(session)}
          canIssue={canIssueInvoice(session)}
          canExport={canExportInvoice(session)}
          canWhatsapp={canPrepareInvoiceWhatsapp(session)}
          canVoid={canVoidInvoice(session)}
        />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Pilih outlet aktif untuk membuka Create Invoice.
        </div>}
  </AppShell>;
}

import { AppShell } from "@/components/layout/app-shell";
import { SlaCutOffClient } from "@/components/quality-control/sla-cut-off-client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { resolveOperationalBusinessDate } from "@/modules/operational-settlement/operational-settlement.service";
import { canSyncSlaCutOff } from "@/modules/quality-control";

export const metadata = { title: "SLA Cut Off" };
export default async function SlaCutOffPage() {
  const session = await requireSession();
  const outlets = await prisma.outlet.findMany({ where: { tenantId: session.tenantId, isActive: true, ...(session.outletId ? { id: session.outletId } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  const initialOutletId = session.outletId ?? outlets[0]?.id ?? "";
  const businessDate = initialOutletId ? (await resolveOperationalBusinessDate({ tenantId: session.tenantId, outletId: initialOutletId })).activeBusinessDate : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return <AppShell session={session}><SlaCutOffClient outlets={outlets} initialOutletId={initialOutletId} businessDate={businessDate} canSync={canSyncSlaCutOff(session)}/></AppShell>;
}

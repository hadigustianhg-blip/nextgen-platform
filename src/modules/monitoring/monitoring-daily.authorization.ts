import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";

export function canReadMonitoringDaily(session: SessionContext) {
  return canAccessResource(session.roles, "MONITORING", "READ");
}

export async function resolveMonitoringOutlet(
  session: SessionContext,
  requestedOutletId?: string,
) {
  if (session.outletId) {
    if (requestedOutletId && requestedOutletId !== session.outletId)
      return null;
    return session.outletId;
  }
  if (!requestedOutletId) return null;
  const outlet = await prisma.outlet.findFirst({
    where: {
      id: requestedOutletId,
      tenantId: session.tenantId,
      isActive: true,
    },
    select: { id: true },
  });
  return outlet?.id ?? null;
}

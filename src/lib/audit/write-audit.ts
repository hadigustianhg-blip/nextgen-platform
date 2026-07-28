import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function writeAudit(input: {
  tenantId: string;
  actorId?: string;
  outletId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}) {
  await prisma.auditLog.create({ data: input });
}

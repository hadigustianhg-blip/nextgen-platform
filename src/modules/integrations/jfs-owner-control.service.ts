import { prisma } from "@/lib/db/prisma";
import { maskAccount } from "./jfs-credential.service";

export type OwnerIntegrationOverviewItem = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  outletId: string;
  outletName: string;
  outletCode: string;
  provider: string;
  connectionStatus: string;
  networkCode: string | null;
  accountMasked: string | null;
  lastConnectedAt: string | null;
  lastTestedAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  isActive: boolean;
};

export async function getOwnerControlPlaneOverview(): Promise<OwnerIntegrationOverviewItem[]> {
  const credentials = await prisma.integrationCredential.findMany({
    include: {
      tenant: { select: { name: true, slug: true } },
      outlet: { select: { name: true, code: true } },
    },
    orderBy: [{ tenantId: "asc" }, { createdAt: "desc" }],
  });

  return credentials.map((cred) => {
    let accountMasked = null;
    try {
      accountMasked = cred.accountEncrypted ? maskAccount(cred.accountEncrypted) : null;
    } catch {
      accountMasked = "******";
    }

    return {
      id: cred.id,
      tenantId: cred.tenantId,
      tenantName: cred.tenant.name,
      tenantSlug: cred.tenant.slug,
      outletId: cred.outletId,
      outletName: cred.outlet.name,
      outletCode: cred.outlet.code,
      provider: cred.provider,
      connectionStatus: cred.connectionStatus,
      networkCode: cred.networkCode,
      accountMasked,
      lastConnectedAt: cred.lastConnectedAt?.toISOString() ?? null,
      lastTestedAt: cred.lastTestedAt?.toISOString() ?? null,
      lastFailureAt: cred.lastFailureAt?.toISOString() ?? null,
      lastFailureCode: cred.lastFailureCode,
      isActive: cred.isActive,
    };
  });
}

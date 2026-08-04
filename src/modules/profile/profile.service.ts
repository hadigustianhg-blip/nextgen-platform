import argon2 from "argon2";
import type { SessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export class ProfileError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

const profileSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastLoginAt: true,
  tenant: { select: { name: true } },
  outlet: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { code: true, name: true } } } },
} as const;

const ownProfileWhere = (session: SessionContext) => ({
  id: session.userId,
  tenantId: session.tenantId,
  ...(session.outletId ? { outletId: session.outletId } : {}),
});

function profileView(profile: {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: Date | null;
  tenant: { name: string };
  outlet: { id: string; code: string; name: string } | null;
  roles: Array<{ role: { code: string; name: string } }>;
}) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    status: profile.status,
    lastLoginAt: profile.lastLoginAt?.toISOString() ?? null,
    tenantName: profile.tenant.name.trim() || "Tenant",
    outlet: profile.outlet,
    roles: profile.roles.map(({ role }) => role),
    avatarUrl: "/avatars/default-user.svg",
    avatarUploadAvailable: false,
  };
}

export async function getOwnProfile(session: SessionContext) {
  const profile = await prisma.user.findFirst({
    where: ownProfileWhere(session),
    select: profileSelect,
  });
  if (!profile) throw new ProfileError("PROFILE_NOT_FOUND", 404);
  return profileView(profile);
}

export async function updateOwnProfile(session: SessionContext, name: string) {
  const timestamp = new Date();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: ownProfileWhere(session),
      select: { id: true, name: true },
    });
    if (!user) throw new ProfileError("PROFILE_NOT_FOUND", 404);
    const profile = await tx.user.update({
      where: { id: user.id },
      data: { name },
      select: profileSelect,
    });
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        actorId: session.userId,
        action: "UPDATE",
        entityType: "USER_PROFILE_UPDATED",
        entityId: user.id,
        metadata: {
          oldName: user.name,
          newName: name,
          actorUserId: session.userId,
          tenantId: session.tenantId,
          outletId: session.outletId,
          timestamp: timestamp.toISOString(),
        },
      },
    });
    return profileView(profile);
  });
}

export async function updateOwnPassword(
  session: SessionContext,
  input: { currentPassword: string; password: string },
) {
  const user = await prisma.user.findFirst({
    where: ownProfileWhere(session),
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new ProfileError("PROFILE_NOT_FOUND", 404);
  if (!(await argon2.verify(user.passwordHash, input.currentPassword))) {
    throw new ProfileError("CURRENT_PASSWORD_INVALID", 400);
  }
  if (await argon2.verify(user.passwordHash, input.password)) {
    throw new ProfileError("PASSWORD_UNCHANGED", 400);
  }
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const timestamp = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        actorId: session.userId,
        action: "UPDATE",
        entityType: "USER_PROFILE_PASSWORD_UPDATED",
        entityId: user.id,
        metadata: {
          actorUserId: session.userId,
          tenantId: session.tenantId,
          outletId: session.outletId,
          timestamp: timestamp.toISOString(),
          sessionsRevoked: true,
        },
      },
    });
    await tx.userSession.deleteMany({ where: { userId: user.id } });
  });
  return { success: true, requiresLogin: true };
}

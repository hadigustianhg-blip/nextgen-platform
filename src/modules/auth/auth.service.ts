import argon2 from "argon2";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { writeAudit } from "@/lib/audit/write-audit";
import { createUserSession, revokeCurrentSession, type SessionContext } from "@/lib/auth/session";
import type { LoginInput } from "@/lib/validations/auth";

export async function login(input: LoginInput) {
  const user = await prisma.user.findFirst({
    where: {
      tenant: { slug: input.tenant.toLowerCase(), status: "ACTIVE" },
      email: input.email.toLowerCase(),
      status: "ACTIVE",
    },
    select: {
      id: true,
      tenantId: true,
      outletId: true,
      passwordHash: true,
    },
  });

  if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
    return { ok: false as const };
  }

  await createUserSession({
    tenantId: user.tenantId,
    userId: user.id,
    outletId: user.outletId,
  });
  const headerStore = await headers();
  await Promise.all([
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
    writeAudit({
      tenantId: user.tenantId,
      actorId: user.id,
      outletId: user.outletId,
      action: "LOGIN",
      entityType: "UserSession",
      ipAddress: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: headerStore.get("user-agent") ?? undefined,
    }),
  ]);

  return { ok: true as const };
}

export async function logout(session: SessionContext) {
  await writeAudit({
    tenantId: session.tenantId,
    actorId: session.userId,
    outletId: session.outletId,
    action: "LOGOUT",
    entityType: "UserSession",
    entityId: session.sessionId,
  });
  await revokeCurrentSession();
}

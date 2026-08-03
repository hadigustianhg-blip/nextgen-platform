import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getSessionCookieName } from "./constants";

export interface SessionContext {
  sessionId: string;
  tenantId: string;
  tenantName: string;
  userId: string;
  userName: string;
  email: string;
  outletId: string | null;
  outletCode: string | null;
  roles: string[];
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionTtlMilliseconds() {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? "168");
  return (Number.isFinite(hours) && hours > 0 ? hours : 168) * 60 * 60 * 1000;
}

export async function createUserSession(input: {
  tenantId: string;
  userId: string;
  outletId: string | null;
}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMilliseconds());
  const headerStore = await headers();

  await prisma.userSession.create({
    data: {
      ...input,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: headerStore.get("user-agent"),
    },
  });

  (await cookies()).set(getSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function resolveSession(): Promise<SessionContext | null> {
  const token = (await cookies()).get(getSessionCookieName())?.value;
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      tenant: { select: { name: true, status: true } },
      outlet: { select: { code: true } },
      user: {
        select: {
          name: true,
          email: true,
          status: true,
          roles: { select: { role: { select: { code: true } } } },
        },
      },
    },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.tenant.status !== "ACTIVE" ||
    session.user.status !== "ACTIVE"
  ) {
    return null;
  }

  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    tenantName: session.tenant.name,
    userId: session.userId,
    userName: session.user.name,
    email: session.user.email,
    outletId: session.outletId,
    outletCode: session.outlet?.code ?? null,
    roles: session.user.roles.map(({ role }) => role.code),
  };
}

export function isTeamSession(session: Pick<SessionContext, "roles">) {
  return session.roles.includes("TEAM");
}

export async function getAnySession() {
  return resolveSession();
}

export async function getSession(): Promise<SessionContext | null> {
  const session = await resolveSession();
  return session && !isTeamSession(session) ? session : null;
}

export async function requireSession() {
  const session = await getAnySession();
  if (!session) redirect("/login");
  if (isTeamSession(session)) redirect("/team");
  return session;
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (token) {
    await prisma.userSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
  cookieStore.delete(getSessionCookieName());
}

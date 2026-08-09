import "server-only";
import type { TeamContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const canonicalCourierName = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");

export async function resolveTeamAcceptedCourierNames(context: TeamContext): Promise<Set<string>> {
  const employee = await prisma.salaryEmployee.findFirst({
    where: {
      id: context.salaryEmployeeId,
      tenantId: context.tenantId,
      outletId: context.outletId,
      status: "ACTIVE",
    },
    select: {
      name: true,
      aliases: {
        where: { isActive: true, sourceType: { in: ["DISPATCH", "BOTH"] } },
        select: { aliasName: true },
      },
    },
  });

  if (!employee) return new Set();

  const accepted = new Set<string>();
  if (employee.name) accepted.add(canonicalCourierName(employee.name));
  for (const alias of employee.aliases) {
    if (alias.aliasName) accepted.add(canonicalCourierName(alias.aliasName));
  }

  return accepted;
}

export async function resolveTeamAcceptedPickupNames(context: TeamContext): Promise<Set<string>> {
  const employee = await prisma.salaryEmployee.findFirst({
    where: {
      id: context.salaryEmployeeId,
      tenantId: context.tenantId,
      outletId: context.outletId,
      status: "ACTIVE",
    },
    select: {
      name: true,
      aliases: {
        where: { isActive: true, sourceType: { in: ["PICKUP", "BOTH"] } },
        select: { aliasName: true },
      },
    },
  });

  if (!employee) return new Set();

  const accepted = new Set<string>();
  if (employee.name) accepted.add(canonicalCourierName(employee.name));
  for (const alias of employee.aliases) {
    if (alias.aliasName) accepted.add(canonicalCourierName(alias.aliasName));
  }

  return accepted;
}

export async function resolveTeamAcceptedNames(context: TeamContext): Promise<Set<string>> {
  const employee = await prisma.salaryEmployee.findFirst({
    where: {
      id: context.salaryEmployeeId,
      tenantId: context.tenantId,
      outletId: context.outletId,
      status: "ACTIVE",
    },
    select: {
      name: true,
      aliases: {
        where: { isActive: true },
        select: { aliasName: true },
      },
    },
  });

  if (!employee) return new Set();

  const accepted = new Set<string>();
  if (employee.name) accepted.add(canonicalCourierName(employee.name));
  for (const alias of employee.aliases) {
    if (alias.aliasName) accepted.add(canonicalCourierName(alias.aliasName));
  }

  return accepted;
}

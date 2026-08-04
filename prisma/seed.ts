import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roleCodes = [
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "FINANCE",
  "HR",
  "QC",
  "OPERATIONAL",
  "VIEWER",
  "TEAM",
] as const;

async function main() {
  const password = process.env.SEED_OWNER_PASSWORD ?? "NextgenDev123!";
  if (process.env.NODE_ENV === "production" && !process.env.SEED_OWNER_PASSWORD) {
    throw new Error("SEED_OWNER_PASSWORD is required in production");
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: "tenant-development" },
    update: {},
    create: { name: "Tenant Development", slug: "tenant-development" },
  });

  const outlet = await prisma.outlet.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "DEV001" } },
    update: { isActive: true },
    create: { tenantId: tenant.id, code: "DEV001", name: "Development Outlet" },
  });

  const roles = await Promise.all(
    roleCodes.map((code) =>
      prisma.role.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code } },
        update: { name: code.replaceAll("_", " ") },
        create: {
          tenantId: tenant.id,
          code,
          name: code.replaceAll("_", " "),
        },
      }),
    ),
  );

  const owner = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: "owner@example.test",
      },
    },
    update: {
      outletId: outlet.id,
      name: "Development Owner",
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
    create: {
      tenantId: tenant.id,
      outletId: outlet.id,
      email: "owner@example.test",
      name: "Development Owner",
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });

  const ownerRole = roles.find((role) => role.code === "OWNER");
  if (!ownerRole) throw new Error("OWNER role was not created");

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: owner.id, roleId: ownerRole.id } },
    update: {},
    create: { userId: owner.id, roleId: ownerRole.id },
  });

  console.info("Development seed completed.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

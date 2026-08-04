import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ownPasswordUpdateSchema, ownProfileUpdateSchema } from "./profile.validation";

const root = process.cwd();

describe("own profile contract", () => {
  it("only accepts the current user's editable name", () => {
    expect(ownProfileUpdateSchema.parse({ name: "  Nama Baru  " })).toEqual({ name: "Nama Baru" });
    expect(ownProfileUpdateSchema.safeParse({ name: "Nama", role: "OWNER" }).success).toBe(false);
    expect(ownProfileUpdateSchema.safeParse({ name: "Nama", outletId: "other" }).success).toBe(false);
    expect(ownProfileUpdateSchema.safeParse({ name: "Nama", email: "other@example.test" }).success).toBe(false);
    expect(ownProfileUpdateSchema.safeParse({ name: "Nama", userId: "other" }).success).toBe(false);
  });

  it("enforces password policy, difference, and confirmation", () => {
    expect(ownPasswordUpdateSchema.safeParse({ currentPassword: "old-password", password: "NewPassword123!", confirmPassword: "NewPassword123!" }).success).toBe(true);
    expect(ownPasswordUpdateSchema.safeParse({ currentPassword: "old-password", password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(ownPasswordUpdateSchema.safeParse({ currentPassword: "old-password", password: "NewPassword123!", confirmPassword: "different123!" }).success).toBe(false);
    expect(ownPasswordUpdateSchema.safeParse({ currentPassword: "SamePassword123!", password: "SamePassword123!", confirmPassword: "SamePassword123!" }).success).toBe(false);
    expect(ownPasswordUpdateSchema.safeParse({ currentPassword: "old-password", password: "x".repeat(129), confirmPassword: "x".repeat(129) }).success).toBe(false);
  });

  it("scopes backend reads to session identity and exposes no credential", async () => {
    const source = await readFile(`${root}/src/modules/profile/profile.service.ts`, "utf8");
    expect(source).toContain("id: session.userId");
    expect(source).toContain("tenantId: session.tenantId");
    expect(source).toContain("outletId: session.outletId");
    expect(source).toContain('avatarUrl: "/avatars/default-user.svg"');
    expect(source).toContain("tenant: { select: { name: true } }");
    expect(source).toContain('entityType: "USER_PROFILE_UPDATED"');
    expect(source).toContain('entityType: "USER_PROFILE_PASSWORD_UPDATED"');
    expect(source).toContain("tx.userSession.deleteMany");
    expect(source).not.toMatch(/metadata:\s*\{[^}]*password/is);
  });

  it("wires protected JSON APIs and independent password visibility", async () => {
    const route = await readFile(`${root}/src/app/api/profile/route.ts`, "utf8");
    const passwordRoute = await readFile(`${root}/src/app/api/profile/change-password/route.ts`, "utf8");
    const ui = await readFile(`${root}/src/components/profile/profile-client.tsx`, "utf8");
    expect(route).toContain("getSession()");
    expect(route).toContain("ownProfileUpdateSchema.safeParse");
    expect(passwordRoute).toContain("ownPasswordUpdateSchema.safeParse");
    expect(ui).toContain("router.refresh()");
    expect(ui).toContain('router.replace("/login?passwordChanged=1")');
    expect(ui).toContain("showCurrent");
    expect(ui).toContain("showNew");
    expect(ui).toContain("showConfirm");
  });

  it("removes demo identity from runtime and seed sources", async () => {
    const files = ["src/components/forms/login-form.tsx", "src/lib/auth/session.ts", "src/components/layout/app-header.tsx", "src/app/team/page.tsx", "prisma/seed.ts"];
    const sources = await Promise.all(files.map((file) => readFile(`${root}/${file}`, "utf8")));
    expect(sources.join("\n")).not.toMatch(/NEXTGEN Demo|nextgen-demo|SUM001A/);
  });
});

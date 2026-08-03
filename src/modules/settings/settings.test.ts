import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccessSettings } from "./settings.authorization";
import { canonicalizeFinancialCategory, normalizeFinancialCategory, sanitizeAuditMetadata } from "./settings.service";

const source = readFileSync(new URL("./settings.service.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../prisma/migrations/20260803000400_add_settings_foundation/migration.sql", import.meta.url), "utf8");

describe("Settings foundation", () => {
  it("allows only OWNER or ADMIN", () => {
    expect(canAccessSettings({ roles: ["OWNER"] })).toBe(true);
    expect(canAccessSettings({ roles: ["ADMIN"] })).toBe(true);
    for (const role of ["FINANCE", "HR", "QC", "OPERATIONAL", "VIEWER", "SUPER_ADMIN"]) expect(canAccessSettings({ roles: [role] })).toBe(false);
  });

  it("normalizes canonical financial category safely", () => {
    expect(normalizeFinancialCategory("  Pendapatan\u00a0  lain  ")).toBe("Pendapatan lain");
    expect(canonicalizeFinancialCategory("Biaya  Kurir")).toBe("BIAYA KURIR");
  });

  it("adds only the approved profile fields and isolated category model", () => {
    expect(schema).toContain("model FinancialCategory");
    expect(schema).toContain("@@unique([tenantId, outletId, type, canonicalName])");
    expect(schema).toContain("address                    String?");
  });

  it("uses the existing OutletBankAccount model", () => {
    expect(source).toContain("prisma.outletBankAccount.findMany");
    expect(schema.match(/model OutletBankAccount/g)).toHaveLength(1);
  });

  it("scopes data by tenant and outlet", () => {
    expect(source).toContain("buildTenantOutletWhere(scope)");
    expect(source).toContain("buildOutletWhere(scope)");
  });

  it("protects the last active owner and never hard-deletes a user", () => {
    expect(source).toContain("LAST_ACTIVE_OWNER");
    expect(source).not.toContain("tx.user.delete(");
    expect(source).not.toContain("prisma.user.delete(");
  });

  it("sanitizes sensitive audit metadata recursively", () => {
    expect(sanitizeAuditMetadata({ ok: "yes", password: "secret", nested: { authToken: "hidden", count: 2 } })).toEqual({ ok: "yes", nested: { count: 2 } });
  });

  it("keeps integration response free of credentials", () => {
    expect(source).not.toMatch(/encryptedPayload\s*:/);
    expect(source).not.toMatch(/DATABASE_URL\)/);
    expect(source).not.toContain("process.env.JFS_AUTH");
  });

  it("makes maintenance preview and simulation read-only", () => {
    const maintenance = source.slice(source.indexOf("export async function getMaintenancePreview"));
    expect(maintenance).not.toMatch(/\.(delete|deleteMany|update|updateMany|create|createMany)\(/);
    expect(maintenance).not.toContain("$executeRaw");
    expect(maintenance).toContain("writesPerformed: 0");
    expect(maintenance).toContain("Tidak ada cache aplikasi yang dapat dibersihkan");
    expect(maintenance).toContain("salaryPublicationShareExpired");
    expect(maintenance).toContain("salaryPublicationShareRevoked");
  });

  it("uses a non-destructive additive migration", () => {
    expect(migration).toContain("ADD COLUMN");
    expect(migration).toContain("CREATE TABLE \"FinancialCategory\"");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(migration).not.toMatch(/TRUNCATE|DELETE FROM/i);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccessSettings } from "./settings.authorization";
import { canonicalizeFinancialCategory, normalizeFinancialCategory, sanitizeAuditMetadata } from "./settings.service";

const source = readFileSync(new URL("./settings.service.ts", import.meta.url), "utf8");
const maintenanceSource = readFileSync(new URL("./settings.maintenance.service.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../prisma/migrations/20260803000400_add_settings_foundation/migration.sql", import.meta.url), "utf8");
const teamMigration = readFileSync(new URL("../../../prisma/migrations/20260803000500_add_team_membership/migration.sql", import.meta.url), "utf8");
const targetMigration = readFileSync(new URL("../../../prisma/migrations/20260804000100_add_operational_target_setting/migration.sql", import.meta.url), "utf8");
const usersUi = readFileSync(new URL("../../components/settings/settings-users.tsx", import.meta.url), "utf8");
const maintenanceUi = readFileSync(new URL("../../components/settings/settings-maintenance.tsx", import.meta.url), "utf8");

describe("Settings foundation", () => {
  it("allows only OWNER or ADMIN", () => {
    expect(canAccessSettings({ roles: ["OWNER"] })).toBe(true);
    expect(canAccessSettings({ roles: ["ADMIN"] })).toBe(true);
    for (const role of ["FINANCE", "HR", "QC", "OPERATIONAL", "VIEWER", "SUPER_ADMIN", "TEAM"]) expect(canAccessSettings({ roles: [role] })).toBe(false);
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

  it("keeps Maintenance reset isolated and free of dangerous raw SQL", () => {
    expect(maintenanceSource).not.toMatch(/\$(executeRaw|queryRaw)/);
    expect(maintenanceSource).not.toMatch(/TRUNCATE|DROP\s+TABLE|DELETE\s+FROM/i);
    expect(maintenanceSource).toContain('status: "VOID"');
    expect(maintenanceSource).toContain('entityType: "MAINTENANCE_RESET_EXECUTED"');
    expect(maintenanceSource).toContain('isolationLevel: "Serializable"');
  });

  it("uses a non-destructive additive migration", () => {
    expect(migration).toContain("ADD COLUMN");
    expect(migration).toContain("CREATE TABLE \"FinancialCategory\"");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(migration).not.toMatch(/TRUNCATE|DELETE FROM/i);
  });

  it("adds an isolated TeamMembership identity bridge and TEAM role additively", () => {
    expect(schema).toContain("model TeamMembership");
    expect(schema).toContain("salaryEmployeeId String");
    expect(teamMigration).toContain('CREATE TABLE "TeamMembership"');
    expect(teamMigration).toContain('TeamMembership_one_active_per_user_key');
    expect(teamMigration).toContain('TeamMembership_one_active_per_employee_key');
    expect(teamMigration).toContain("'TEAM'");
    expect(teamMigration).not.toMatch(/UPDATE\s+"SalaryEmployee"|DELETE FROM|DROP\s+(TABLE|COLUMN|TYPE)/i);
  });

  it("adds tenant/outlet Target & KPI storage without changing transaction tables", () => {
    expect(schema).toContain("model OperationalTargetSetting");
    expect(schema).toContain("@@unique([tenantId, outletId])");
    expect(targetMigration).toContain('CREATE TABLE "OperationalTargetSetting"');
    expect(targetMigration).toContain("ADD VALUE IF NOT EXISTS 'SETTINGS_TARGET_KPI_UPDATED'");
    expect(targetMigration).toContain('DECIMAL(5,2)');
    expect(targetMigration).toContain('"pendingMaximum" INTEGER');
    expect(targetMigration).not.toMatch(/ALTER TABLE "(Raw|Master|Salary|Payment|OperationalExpense)/);
    expect(targetMigration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)|TRUNCATE|DELETE FROM/i);
  });

  it("provides custom user management UI without native confirmation dialogs", () => {
    for (const label of ["Tambah User", "Cari user", "Semua Tipe", "Semua Role", "Semua Status", "Team / Kurir PWA", "Reset Password"]) expect(usersUi).toContain(label);
    expect(usersUi).toContain('role="dialog"');
    expect(usersUi).not.toMatch(/window\.(alert|confirm|prompt)|\bconfirm\(/);
    expect(usersUi).not.toContain("passwordHash");
  });

  it("uses the Admin label while preserving the ADMIN_WEB contract", () => {
    expect(usersUi).toContain('<option value="ADMIN_WEB">Admin</option>');
    expect(usersUi).not.toContain('>Admin Web<');
    expect(usersUi).toContain('"ADMIN_WEB"');
  });

  it("renders Maintenance cards and custom dialogs without raw JSON output", () => {
    for (const label of ["Lihat Detail", "Reset Data", "Alasan reset", "Ketik RESET", "Tidak ada data"]) expect(maintenanceUi).toContain(label);
    expect(maintenanceUi).toContain('role="dialog"');
    expect(maintenanceUi).not.toContain("<pre");
    expect(maintenanceUi).not.toMatch(/window\.(alert|confirm|prompt)/);
  });
});

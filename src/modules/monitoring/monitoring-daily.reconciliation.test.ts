import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Monitoring Daily reconciliation contracts", () => {
  it("keeps the query scoped to tenant, outlet, operationalDate, and active data", async () => {
    const service = await readFile(
      new URL("./monitoring-daily.service.ts", import.meta.url),
      "utf8",
    );
    for (const scope of [
      "tenantId: input.tenantId",
      "outletId: input.outletId",
      "operationalDate",
      "syncStatus: \"NORMALIZED\"",
      "isActive: true",
    ]) expect(service).toContain(scope);
    expect(service).not.toMatch(/createdAt:\s*operationalDate/);
    expect(service).not.toMatch(/updatedAt:\s*operationalDate/);
  });

  it("adds an audit-safe active marker without deleting dispatch history", async () => {
    const migration = await readFile(
      new URL(
        "../../../prisma/migrations/20260731000400_add_raw_dispatch_active_version/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain('ADD COLUMN "isActive"');
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });

  it("provides separate dry-run and explicit apply repair modes", async () => {
    const script = await readFile(
      new URL("../../../scripts/reconcile-monitoring-dispatch.ts", import.meta.url),
      "utf8",
    );
    expect(script).toContain('process.argv.includes("--apply")');
    expect(script).toContain('mode: apply ? "APPLY" : "DRY_RUN"');
    expect(script).toContain("willBeSuperseded");
    expect(script).not.toContain("deleteMany");
  });

  it("protects diagnostics and does not expose them in production", async () => {
    const route = await readFile(
      new URL(
        "../../app/api/monitoring/daily/diagnostic/route.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(route).toContain('process.env.NODE_ENV === "production"');
    expect(route).toContain('["OWNER", "ADMIN"]');
    expect(route).not.toMatch(/token|cookie|password/i);
  });
});

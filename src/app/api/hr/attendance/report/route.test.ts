import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HR Attendance Report API endpoint contract & security", () => {
  it("strictly scopes query by session tenantId & outletId and checks ATTENDANCE READ permission", async () => {
    const source = await readFile(
      `${process.cwd()}/src/app/api/hr/attendance/report/route.ts`,
      "utf8",
    );
    expect(source).toContain("canAccessResource(session.roles, \"ATTENDANCE\", \"READ\")");
    expect(source).toContain("tenantId: session.tenantId");
    expect(source).toContain("outletId: session.outletId");
    expect(source).toContain("workableDays");
    expect(source).not.toMatch(/prisma\.teamMembership\.findMany\(\s*\{\s*where:\s*\{(?![^}]*tenantId)/);
  });

  it("export route sets Content-Disposition header and creates audit log", async () => {
    const exportSource = await readFile(
      `${process.cwd()}/src/app/api/hr/attendance/report/export/route.ts`,
      "utf8",
    );
    expect(exportSource).toContain("createWorkbook");
    expect(exportSource).toContain("Content-Disposition");
    expect(exportSource).toContain("EXPORT_ATTENDANCE_RECAP");
    expect(exportSource).toContain("rekap-absensi-");
  });
});

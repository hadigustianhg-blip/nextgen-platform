import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertTeamDataIsolation } from "./team-response";

const forbidden = ["salary", "gross", "net", "netSalary", "baseSalary", "bonus", "incentive", "allowance", "payroll", "salaryClosing", "salaryRecap", "salarySnapshot", "salaryPublication", "salaryCard", "slipGaji", "publication"];

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  }));
  return nested.flat();
}

describe("critical TEAM data isolation", () => {
  it("accepts only the explicit attendance response contract", () => {
    const payload = {
      success: true,
      data: {
        businessDate: "2026-08-04",
        attendance: { id: "record-1", status: "PRESENT", checkInAt: "2026-08-04T01:00:00.000Z", checkOutAt: null },
        location: { configured: true, active: true, radiusMeters: 100 },
      },
    };
    expect(() => assertTeamDataIsolation(payload)).not.toThrow();
    const serialized = JSON.stringify(payload).toLowerCase();
    for (const term of forbidden) expect(serialized).not.toContain(term.toLowerCase());
  });

  it.each(forbidden)("rejects forbidden TEAM response key or value: %s", (term) => {
    expect(() => assertTeamDataIsolation({ [term]: null })).toThrow("TEAM_DATA_ISOLATION_VIOLATION");
    expect(() => assertTeamDataIsolation({ message: term })).toThrow("TEAM_DATA_ISOLATION_VIOLATION");
  });

  it("requires every TEAM API route to use the backend response guard and no payroll module", async () => {
    const directory = `${process.cwd()}/src/app/api/team`;
    const routes = (await filesBelow(directory)).filter((file) => file.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const source = await readFile(route, "utf8");
      expect(source, route).toContain("teamJson");
      expect(source, route).not.toMatch(/modules\/salary|api\/finance\/salary/);
    }
  });

  it("keeps TEAM UI independent from finance payroll endpoints", async () => {
    const files = await filesBelow(`${process.cwd()}/src/app/team`);
    const componentFiles = await filesBelow(`${process.cwd()}/src/components/attendance`);
    const source = (await Promise.all([...files, ...componentFiles].filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => readFile(file, "utf8")))).join("\n");
    expect(source).not.toMatch(/\/api\/finance\/salary|modules\/salary/);
  });

  it("guards all authenticated payroll APIs and both public card routes from TEAM sessions", async () => {
    const routes = (await filesBelow(`${process.cwd()}/src/app/api/finance/salary`)).filter((file) => file.endsWith("route.ts"));
    for (const route of routes) expect(await readFile(route, "utf8"), route).toContain("getSession()");
    for (const page of [
      `${process.cwd()}/src/app/s/[shareCode]/page.tsx`,
      `${process.cwd()}/src/app/salary-card/share/[token]/page.tsx`,
    ]) {
      const source = await readFile(page, "utf8");
      expect(source).toContain("getAnySession()");
      expect(source).toContain("isTeamSession(session)");
      expect(source).toContain('redirect("/team")');
    }
  });

  it("does not expose a personal loan endpoint until a canonical ledger exists", async () => {
    const routes = (await filesBelow(`${process.cwd()}/src/app/api/team`)).filter((file) => file.endsWith("route.ts"));
    expect(routes.some((route) => /kasbon|loan/i.test(route))).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const routes = [
  "./business-profile/route.ts", "./users/route.ts", "./users/[id]/route.ts",
  "./users/[id]/reset-password/route.ts", "./finance/banks/route.ts",
  "./users/[id]/activate/route.ts", "./users/[id]/deactivate/route.ts",
  "./users/available-employees/route.ts",
  "./finance/banks/[id]/route.ts", "./finance/categories/route.ts",
  "./finance/categories/[id]/route.ts", "./integrations/route.ts",
  "./integrations/test/route.ts", "./maintenance/preview/route.ts",
  "./maintenance/simulate/route.ts", "./audit-logs/route.ts",
];

describe("Settings API contracts", () => {
  it("applies the common Settings authorization guard to every data route", () => {
    for (const route of routes) expect(read(route), route).toContain("requireSettingsApi()");
  });

  it("returns JSON on every route", () => {
    for (const route of routes) expect(read(route), route).toContain("NextResponse.json");
  });

  it("uses a safe shared error response", () => {
    const handler = read("../../../modules/settings/settings.http.ts");
    expect(handler).toContain("NextResponse.json");
    expect(handler).toContain("errorName");
    expect(handler).toContain("prismaCode");
    expect(handler).not.toContain("error.message");
  });

  it("parses non-JSON frontend responses safely", () => {
    const client = read("../../../components/settings/settings-client.tsx");
    expect(client).toContain("await response.text()");
    expect(client).toContain("parseSettingsResponse");
    expect(client).toContain("SETTINGS_REQUEST_FAILED");
  });

  it("keeps integration test and maintenance endpoints write-free", () => {
    for (const route of ["./integrations/test/route.ts", "./maintenance/preview/route.ts", "./maintenance/simulate/route.ts"]) {
      const value = read(route);
      expect(value).not.toMatch(/delete|truncate|executeRaw/i);
    }
  });

  it("exposes no delete method", () => {
    for (const route of routes) expect(read(route)).not.toMatch(/export async function DELETE/);
  });
});

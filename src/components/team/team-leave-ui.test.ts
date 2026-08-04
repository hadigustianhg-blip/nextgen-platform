import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFile(`${process.cwd()}/${file}`, "utf8");

describe("Team Leave mobile UI", () => {
  it("provides mobile form, filters, badges, cancel guard, and double-submit guard", async () => {
    const source = await read("src/components/team/team-leave-client.tsx");
    for (const label of ["Semua", "Pending", "Disetujui", "Ditolak", "Cuti", "Izin", "Sakit"]) expect(source).toContain(label);
    expect(source).toContain('selected.status === "PENDING"');
    expect(source).toContain("if (submitting || formError) return");
    expect(source).toContain("min-h-11");
    expect(source).toContain("text-base");
    expect(source).toContain("safe-area-inset-bottom");
    expect(source).not.toMatch(/upload|attachment|FormData/);
  });

  it("loads the latest own request on Team Home and uses typed quick actions", async () => {
    const source = await read("src/components/team/team-home-client.tsx");
    expect(source).toContain('/api/team/leave?page=1&pageSize=1');
    expect(source).toContain('/team/leave?type=LEAVE');
    expect(source).toContain('/team/leave?type=PERMISSION');
    expect(source).toContain('/team/leave?type=SICK');
  });

  it("keeps Team responses guarded and routes own-scoped", async () => {
    const routes = ["src/app/api/team/leave/route.ts", "src/app/api/team/leave/[id]/route.ts", "src/app/api/team/leave/[id]/cancel/route.ts"];
    for (const file of routes) {
      const source = await read(file);
      expect(source).toContain("teamJson");
      expect(source).toContain("requireTeamLeaveContext");
      expect(source).not.toMatch(/modules\/salary|employeeId.*request|tenantId.*request|outletId.*request/);
    }
  });
});

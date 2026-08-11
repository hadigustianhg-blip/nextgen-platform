import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Attendance UI and API boundaries", () => {
  it("requests geolocation only from explicit team/admin actions", async () => {
    const team = await readFile(new URL("./team-attendance-client.tsx", import.meta.url), "utf8");
    const admin = await readFile(new URL("./attendance-admin-client.tsx", import.meta.url), "utf8");
    expect(team).toContain("async function submit(action: Action)");
    expect(team).toContain("navigator.geolocation.getCurrentPosition");
    expect(team).not.toMatch(/useEffect\([^)]*geolocation/s);
    expect(admin).toContain("function useCurrentLocation()");
    expect(team).toContain("if (loading) return;");
    expect(team).toContain("overflow-x-hidden");
    expect(team).toContain("min-h-11");
  });

  it("separates TEAM and admin APIs and never accepts employeeId", async () => {
    const teamRoute = await readFile(`${process.cwd()}/src/app/api/team/attendance/clock-in/route.ts`, "utf8");
    const adminRoute = await readFile(`${process.cwd()}/src/app/api/hr/attendance/[id]/correct/route.ts`, "utf8");
    expect(teamRoute).toContain("requireTeamAttendanceContext");
    expect(teamRoute).not.toContain("employeeId");
    expect(adminRoute).toContain('requireAttendanceAdmin("UPDATE")');
  });

  it("does not introduce selfie, upload, offline queue, manifest, or service worker", async () => {
    const files = [
      `${process.cwd()}/src/modules/attendance/attendance.service.ts`,
      `${process.cwd()}/src/components/attendance/team-attendance-client.tsx`,
      `${process.cwd()}/src/components/attendance/attendance-admin-client.tsx`,
    ];
    const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    expect(source).not.toMatch(/selfie|camera|mediaDevices|serviceWorker|offline queue|upload/i);
  });

  it("safely handles leave approval rendering without un-guarded charAt or undefined property access", async () => {
    const admin = await readFile(new URL("./attendance-admin-client.tsx", import.meta.url), "utf8");
    expect(admin).not.toContain("item.employeeName.charAt");
    expect(admin).toContain("item.employee?.name || item.employeeName");
    expect(admin).toContain("empName.trim().charAt(0)");
    expect(admin).toContain("{reviewerName &&");
  });
});

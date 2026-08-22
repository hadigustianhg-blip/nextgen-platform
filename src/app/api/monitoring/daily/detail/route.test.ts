import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Monitoring Daily detail API security contract", () => {
  it("requires session, existing permission, scoped outlet, date, and whitelisted metric", async () => {
    const route = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(route).toContain("if (!session)");
    expect(route).toContain("canReadMonitoringDaily(session)");
    expect(route).toContain("resolveMonitoringOutlet(session");
    expect(route).toContain("session.tenantId");
    expect(route).toContain("monitoringDailyDetailQuerySchema");
    expect(route).not.toContain("tenantId: parsed");
  });
});

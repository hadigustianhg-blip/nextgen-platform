import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./settings-integrations.tsx", import.meta.url), "utf8");

describe("Settings JFS Waybill Helper distribution card", () => {
  it("renders only from DEV availability data with the canonical download endpoint", () => {
    expect(source).toContain("data.jfsWaybillHelper?.available");
    expect(source).toContain("JFS Waybill Helper");
    expect(source).toContain("DEV Extension");
    expect(source).toContain("Download Extension");
    expect(source).toContain("/api/settings/integrations/jfs-waybill-helper/download");
    expect(source).toContain("Version {data.jfsWaybillHelper.version}");
    expect(source).toContain("chrome://extensions");
  });
});

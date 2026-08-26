import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildJfsHelperPackage,
  inspectZipEntryNames,
  JFS_HELPER_ARCHIVE_DIRECTORY,
  JFS_HELPER_RUNTIME_FILES,
} from "./jfs-helper-package";
import { resolveJfsHelperDistribution } from "./jfs-helper-distribution";

describe("JFS helper extension package", () => {
  it("creates a deterministic allowlisted ZIP with one Load unpacked folder", async () => {
    const first = await buildJfsHelperPackage({ target: "development" });
    const second = await buildJfsHelperPackage({ target: "development" });
    const expected = JFS_HELPER_RUNTIME_FILES.map((name) => `${JFS_HELPER_ARCHIVE_DIRECTORY}/${name}`);
    expect(first.archive.equals(second.archive)).toBe(true);
    expect(first.files).toEqual(expected);
    expect(inspectZipEntryNames(first.archive)).toEqual(expected);
    expect(first.files).toContain("nextgen-jfs-helper/manifest.json");
    expect(first.files.every((name) => !/(?:test|node_modules|\.git|\.env)/i.test(name))).toBe(true);
    expect(first.version).toBe("0.1.0");
    expect(first.archiveName).toBe("nextgen-jfs-helper-dev.zip");
  });

  it("contains the DEV helper contract without production URL, secrets, PII, or broad permissions", async () => {
    const result = await buildJfsHelperPackage({ target: "development" });
    const text = result.archive.toString("utf8");
    expect(text).toContain("https://dev.nextgen-platform.com/helper/pickup-adjustment");
    for (const forbidden of ["https://app.nextgen-platform.com", "AuthToken", "<all_urls>", "DATABASE_URL", "senderAddress", "receiverAddress"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("creates a production package with only the production helper target", async () => {
    const result = await buildJfsHelperPackage({ target: "production" });
    const text = result.archive.toString("utf8");
    expect(result.archiveName).toBe("nextgen-jfs-helper.zip");
    expect(text).toContain("https://app.nextgen-platform.com/helper/pickup-adjustment");
    expect(text).not.toContain("https://dev.nextgen-platform.com");
    expect(text).not.toContain("AuthToken");
    expect(text).not.toContain("<all_urls>");
  });

  it("fails packaging when allowlisted source contains a production helper URL", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "nextgen-helper-test-"));
    for (const filename of JFS_HELPER_RUNTIME_FILES) {
      const source = filename === "manifest.json"
        ? JSON.stringify({ version: "0.1.0", permissions: [] })
        : filename === "core.mjs"
          ? "https://dev.nextgen-platform.com/helper/pickup-adjustment\nhttps://app.nextgen-platform.com"
          : "safe";
      await writeFile(path.join(temporaryRoot, filename), source);
    }
    await expect(buildJfsHelperPackage({ sourceRoot: temporaryRoot, target: "development" })).rejects.toThrow("wrong development helper target");
  });

  it("selects only exact canonical development and production environments", () => {
    expect(resolveJfsHelperDistribution({ RAILWAY_ENVIRONMENT_NAME: "development" })).toMatchObject({ archiveName: "nextgen-jfs-helper-dev.zip", environment: "development" });
    expect(resolveJfsHelperDistribution({ RAILWAY_ENVIRONMENT_NAME: "production" })).toMatchObject({ archiveName: "nextgen-jfs-helper.zip", environment: "production" });
    expect(resolveJfsHelperDistribution({ NEXTGEN_ENVIRONMENT: "development" })?.badge).toBe("DEV Extension");
    expect(resolveJfsHelperDistribution({ NEXTGEN_ENVIRONMENT: "production" })?.badge).toBe("Production Extension");
    expect(resolveJfsHelperDistribution({ RAILWAY_ENVIRONMENT_NAME: "staging" })).toBeNull();
    expect(resolveJfsHelperDistribution({})).toBeNull();
  });
});

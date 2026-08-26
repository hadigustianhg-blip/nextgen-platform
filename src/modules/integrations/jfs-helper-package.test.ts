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
import { isDevelopmentDistributionEnabled } from "./jfs-helper-distribution";

describe("JFS helper extension package", () => {
  it("creates a deterministic allowlisted ZIP with one Load unpacked folder", async () => {
    const first = await buildJfsHelperPackage();
    const second = await buildJfsHelperPackage();
    const expected = JFS_HELPER_RUNTIME_FILES.map((name) => `${JFS_HELPER_ARCHIVE_DIRECTORY}/${name}`);
    expect(first.archive.equals(second.archive)).toBe(true);
    expect(first.files).toEqual(expected);
    expect(inspectZipEntryNames(first.archive)).toEqual(expected);
    expect(first.files).toContain("nextgen-jfs-helper/manifest.json");
    expect(first.files.every((name) => !/(?:test|node_modules|\.git|\.env)/i.test(name))).toBe(true);
    expect(first.version).toBe("0.1.0");
  });

  it("contains the DEV helper contract without production URL, secrets, PII, or broad permissions", async () => {
    const result = await buildJfsHelperPackage();
    const text = result.archive.toString("utf8");
    expect(text).toContain("https://dev.nextgen-platform.com/helper/pickup-adjustment");
    for (const forbidden of ["https://app.nextgen-platform.com", "AuthToken", "<all_urls>", "DATABASE_URL", "senderAddress", "receiverAddress"]) {
      expect(text).not.toContain(forbidden);
    }
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
    await expect(buildJfsHelperPackage(temporaryRoot)).rejects.toThrow("production helper URL");
  });

  it("enables delivery only for an explicitly named development environment", () => {
    expect(isDevelopmentDistributionEnabled({ NODE_ENV: "development", RAILWAY_ENVIRONMENT_NAME: "development" })).toBe(true);
    expect(isDevelopmentDistributionEnabled({ NODE_ENV: "test", NEXTGEN_ENVIRONMENT: "development" })).toBe(true);
    expect(isDevelopmentDistributionEnabled({ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "development" })).toBe(true);
    expect(isDevelopmentDistributionEnabled({ NODE_ENV: "development", RAILWAY_ENVIRONMENT_NAME: "production" })).toBe(false);
    expect(isDevelopmentDistributionEnabled({ NODE_ENV: "development" })).toBe(false);
  });
});

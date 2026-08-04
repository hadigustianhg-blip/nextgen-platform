import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = path.resolve("scripts/verify-public-assets.mjs");
const requiredAssets = [
  "public/brand/nextgen-logo-light.svg",
  "public/brand/nextgen-wordmark.svg",
  "public/brand/nextgen-mark.svg",
  "public/avatars/default-user.svg",
  "public/backgrounds/dashboard-pattern.svg",
];
const temporaryRoots: string[] = [];

async function createRuntimeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "nextgen-public-assets-"));
  temporaryRoots.push(root);

  for (const asset of requiredAssets) {
    const target = path.join(root, asset);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "fixture", "utf8");
  }

  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe("standalone public asset assertion", () => {
  it("accepts a runtime package containing every required asset", async () => {
    const root = await createRuntimeFixture();
    const output = execFileSync(process.execPath, [scriptPath, root], {
      encoding: "utf8",
    });

    expect(output).toContain("NEXTGEN_PUBLIC_ASSETS_READY: 5 required assets");
  });

  it("fails clearly when a required runtime asset is missing", async () => {
    const root = await createRuntimeFixture();
    await rm(path.join(root, requiredAssets[0]!));
    const result = spawnSync(process.execPath, [scriptPath, root], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXTGEN_PUBLIC_ASSETS_MISSING");
    expect(result.stderr).toContain(requiredAssets[0]);
  });
});

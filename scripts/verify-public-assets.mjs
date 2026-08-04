import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const requiredPublicAssets = [
  "public/brand/nextgen-logo-light.svg",
  "public/brand/nextgen-wordmark.svg",
  "public/brand/nextgen-mark.svg",
  "public/avatars/default-user.svg",
  "public/backgrounds/dashboard-pattern.svg",
];

export async function verifyPublicAssets(runtimeRoot) {
  const missing = [];

  for (const asset of requiredPublicAssets) {
    try {
      await access(path.join(runtimeRoot, asset));
    } catch {
      missing.push(asset);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `NEXTGEN_PUBLIC_ASSETS_MISSING: ${missing.join(", ")}`,
    );
  }

  return requiredPublicAssets.length;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const runtimeRoot = path.resolve(process.argv[2] ?? process.cwd());

  try {
    const assetCount = await verifyPublicAssets(runtimeRoot);
    console.info(`NEXTGEN_PUBLIC_ASSETS_READY: ${assetCount} required assets`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "NEXTGEN_PUBLIC_ASSETS_MISSING");
    process.exitCode = 1;
  }
}

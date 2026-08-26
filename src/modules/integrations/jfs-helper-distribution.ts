import { readFile } from "node:fs/promises";

export const JFS_HELPER_ARCHIVE_NAME = "nextgen-jfs-helper-dev.zip";

export function isDevelopmentDistributionEnabled(env: NodeJS.ProcessEnv = process.env) {
  const environmentName = (env.RAILWAY_ENVIRONMENT_NAME ?? env.NEXTGEN_ENVIRONMENT ?? "").trim().toLowerCase();
  return environmentName === "development";
}

export function loadJfsHelperArchive() {
  return readFile("private-assets/nextgen-jfs-helper-dev.zip");
}

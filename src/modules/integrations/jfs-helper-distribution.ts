import { readFile } from "node:fs/promises";

export type JfsHelperDistribution = {
  archiveName: "nextgen-jfs-helper-dev.zip" | "nextgen-jfs-helper.zip";
  badge: "DEV Extension" | "Production Extension";
  environment: "development" | "production";
};

export function resolveJfsHelperDistribution(
  env: { RAILWAY_ENVIRONMENT_NAME?: string; NEXTGEN_ENVIRONMENT?: string } = {
    RAILWAY_ENVIRONMENT_NAME: process.env.RAILWAY_ENVIRONMENT_NAME,
    NEXTGEN_ENVIRONMENT: process.env.NEXTGEN_ENVIRONMENT,
  },
): JfsHelperDistribution | null {
  const environmentName = (env.RAILWAY_ENVIRONMENT_NAME ?? env.NEXTGEN_ENVIRONMENT ?? "").trim().toLowerCase();
  if (environmentName === "development") {
    return { archiveName: "nextgen-jfs-helper-dev.zip", badge: "DEV Extension", environment: "development" };
  }
  if (environmentName === "production") {
    return { archiveName: "nextgen-jfs-helper.zip", badge: "Production Extension", environment: "production" };
  }
  return null;
}

export function loadJfsHelperArchive(distribution: JfsHelperDistribution) {
  return distribution.environment === "development"
    ? readFile("private-assets/nextgen-jfs-helper-dev.zip")
    : readFile("private-assets/nextgen-jfs-helper.zip");
}

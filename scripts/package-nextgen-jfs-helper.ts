import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildJfsHelperPackage,
  inspectZipEntryNames,
} from "../src/modules/integrations/jfs-helper-package";

const outputDirectory = path.join(process.cwd(), ".next", "standalone", "private-assets");
await mkdir(outputDirectory, { recursive: true });
for (const target of ["development", "production"] as const) {
  const result = await buildJfsHelperPackage({ target });
  await writeFile(path.join(outputDirectory, result.archiveName), result.archive);
  const entries = inspectZipEntryNames(result.archive);
  if (entries.length !== result.files.length || entries.some((entry, index) => entry !== result.files[index])) {
    throw new Error(`Generated ${target} extension ZIP failed entry validation.`);
  }
  console.info(`JFS_HELPER_PACKAGE_READY: ${result.archiveName} v${result.version}`);
  for (const entry of entries) console.info(`- ${entry}`);
}

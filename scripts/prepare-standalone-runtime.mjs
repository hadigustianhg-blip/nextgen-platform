import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPublicAssets } from "./verify-public-assets.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");

await access(path.join(standaloneRoot, "server.js"));
await access(path.join(projectRoot, ".next", "static"));
await access(path.join(projectRoot, "public"));

await mkdir(standaloneNextRoot, { recursive: true });
await cp(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneNextRoot, "static"),
  { recursive: true, force: true },
);
await cp(
  path.join(projectRoot, "public"),
  path.join(standaloneRoot, "public"),
  { recursive: true, force: true },
);

const assetCount = await verifyPublicAssets(standaloneRoot);
console.info(`NEXTGEN_STANDALONE_RUNTIME_READY: ${assetCount} required public assets`);

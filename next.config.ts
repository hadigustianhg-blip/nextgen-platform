import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function avatarRemotePattern() {
  const publicBaseUrl = process.env.AVATAR_STORAGE_PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) return [];
  try {
    const url = new URL(publicBaseUrl);
    if (url.protocol !== "https:") return [];
    return [{ protocol: "https" as const, hostname: url.hostname, port: url.port, pathname: `${url.pathname.replace(/\/$/, "")}/**` }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["pdfkit"],
  poweredByHeader: false,
  images: {
    remotePatterns: avatarRemotePattern(),
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;

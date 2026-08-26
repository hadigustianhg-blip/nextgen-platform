import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import {
  isDevelopmentDistributionEnabled,
  JFS_HELPER_ARCHIVE_NAME,
  loadJfsHelperArchive,
} from "@/modules/integrations/jfs-helper-distribution";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canAccessResource(session.roles, "SETTINGS_INTEGRATIONS", "READ")) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  if (!isDevelopmentDistributionEnabled()) {
    return NextResponse.json({ success: false, error: { code: "DEV_EXTENSION_UNAVAILABLE" } }, { status: 404 });
  }

  const archive = await loadJfsHelperArchive();
  return new Response(new Uint8Array(archive), {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${JFS_HELPER_ARCHIVE_NAME}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

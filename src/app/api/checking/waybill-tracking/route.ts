import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import {
  getRealtimeWaybillTracking,
  waybillTrackingRequestSchema,
  WaybillTrackingServiceError,
} from "@/modules/checking";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

function extractUpstreamStatus(message: string): number | undefined {
  const match = message.match(/\bstatus\s+(\d{3})\b/i) || message.match(/\b(\d{3})\b/);
  if (match) {
    const code = parseInt(match[1], 10);
    if (code >= 400 && code <= 599) return code;
  }
  return undefined;
}

function inferCoarseStage(error: unknown, knownCode?: string): string {
  if (knownCode === "WAYBILL_TRACKING_NOT_FOUND") return "NOT_FOUND";
  if (!error) return "UNKNOWN";
  if (error instanceof Error) {
    const name = error.name;
    const msg = error.message;
    if (name === "ZodError" || msg.includes("ZodError") || msg.includes("invalid_type")) {
      return "RESPONSE_SCHEMA_PARSE_ERROR";
    }
    if (msg.includes("JFS_MIDDLEWARE_BASE_URL") || msg.includes("configured")) {
      return "MIDDLEWARE_CONFIG_MISSING";
    }
    if (msg.includes("outlet") || msg.includes("credential")) {
      return "CREDENTIAL_MISSING";
    }
    if (msg.includes("Upstream middleware request failed") || msg.includes("status")) {
      return "UPSTREAM_MIDDLEWARE_HTTP_ERROR";
    }
    if (name.includes("Fetch") || msg.includes("fetch") || msg.includes("network")) {
      return "UPSTREAM_NETWORK_ERROR";
    }
  }
  return "UNKNOWN";
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." } }, { status: 401, headers: noStore });
  }
  if (!session.outletId) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED", message: "Pilih outlet aktif." } }, { status: 400, headers: noStore });
  }
  if (!canAccessResource(session.roles, "WAYBILL_TRACKING", "READ")) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Akses ditolak." } }, { status: 403, headers: noStore });
  }

  const parsed = waybillTrackingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Nomor resi tidak valid." } }, { status: 400, headers: noStore });
  }

  try {
    const data = await getRealtimeWaybillTracking(
      { tenantId: session.tenantId, outletId: session.outletId },
      parsed.data.waybillNo,
    );
    return NextResponse.json({ data }, { headers: noStore });
  } catch (error) {
    const known = error instanceof WaybillTrackingServiceError ? error : null;
    const notFound = known?.code === "WAYBILL_TRACKING_NOT_FOUND";

    const errorType = error instanceof Error ? error.name : typeof error;
    const serviceCode = known ? known.code : "UNKNOWN";
    const status = known ? known.status : 502;
    const upstreamStatus = error instanceof Error ? extractUpstreamStatus(error.message) : undefined;
    const stage = inferCoarseStage(error, known?.code);

    console.error("[NEXTGEN][WAYBILL_TRACKING] request failed", {
      source: "WAYBILL_TRACKING_API",
      errorType,
      serviceCode,
      status,
      stage,
      ...(upstreamStatus ? { upstreamStatus } : {}),
    });

    return NextResponse.json({
      error: {
        code: notFound ? "WAYBILL_TRACKING_NOT_FOUND" : "TRACKING_UNAVAILABLE",
        message: notFound ? "Resi tidak ditemukan." : "Tracking belum dapat diperiksa.",
      },
    }, { status: notFound ? 404 : 502, headers: noStore });
  }
}

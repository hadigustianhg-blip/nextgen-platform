import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadInvoice, getInvoiceSourceSellers, invoiceRangeSchema, invoiceScope,
  migrationRequiredResponse,
} from "@/modules/invoice";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadInvoice(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = invoiceScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = invoiceRangeSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_DATE_RANGE" } }, { status: 400 });
  try {
    const data = await getInvoiceSourceSellers({ ...scope, ...parsed.data });
    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") {
      return migrationRequiredResponse();
    }
    return NextResponse.json({
      success: false,
      code: "SOURCE_SELLERS_FAILED",
      message: "Data seller tidak dapat dimuat.",
    }, { status: 500 });
  }
}

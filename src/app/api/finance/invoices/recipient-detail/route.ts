import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canMutateInvoice, fetchSelectedRecipientDetail, invoiceErrorResponse,
  invoiceScope,
} from "@/modules/invoice";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!canMutateInvoice(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = invoiceScope(session);
  if (!scope) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const waybillNo = new URL(request.url).searchParams.get("waybillNo") ?? "";
  try {
    const data = await fetchSelectedRecipientDetail(scope, waybillNo);
    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return invoiceErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canIssueInvoice, invoiceErrorResponse, invoiceScope, issueInvoice,
} from "@/modules/invoice";

type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canIssueInvoice(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = invoiceScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  try {
    const data = await issueInvoice({
      ...scope, actorId: session.userId, outletCode: session.outletCode,
    }, (await context.params).id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return invoiceErrorResponse(error);
  }
}

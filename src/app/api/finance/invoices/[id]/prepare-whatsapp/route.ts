import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canPrepareInvoiceWhatsapp, invoiceErrorResponse, invoiceScope,
  invoiceWhatsappSchema, prepareInvoiceWhatsapp,
} from "@/modules/invoice";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canPrepareInvoiceWhatsapp(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = invoiceScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const parsed = invoiceWhatsappSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  try {
    const data = await prepareInvoiceWhatsapp({
      ...scope, actorId: session.userId, outletCode: session.outletCode,
    }, (await context.params).id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return invoiceErrorResponse(error);
  }
}

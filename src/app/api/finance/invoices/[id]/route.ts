import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canMutateInvoice, canReadInvoice, getInvoice, invoiceDraftSchema,
  invoiceErrorResponse, invoiceScope, migrationRequiredResponse,
  updateInvoiceDraft,
} from "@/modules/invoice";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadInvoice(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = invoiceScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const invoice = await getInvoice(scope, (await context.params).id);
  if (!invoice) return NextResponse.json({ error: { code: "INVOICE_NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ success: true, data: invoice }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canMutateInvoice(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = invoiceScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const parsed = invoiceDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const itemsInvalid = parsed.error.issues.some((issue) => issue.path[0] === "itemIds");
    return NextResponse.json(itemsInvalid ? {
      success: false,
      code: "INVOICE_ITEMS_REQUIRED",
      message: "Pilih minimal satu resi untuk membuat invoice.",
    } : {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Data invoice tidak valid.",
    }, { status: 400 });
  }
  try {
    const data = await updateInvoiceDraft({
      ...scope, actorId: session.userId, outletCode: session.outletCode,
    }, (await context.params).id, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") {
      return migrationRequiredResponse();
    }
    return invoiceErrorResponse(error);
  }
}

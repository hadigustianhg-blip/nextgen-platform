import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import {
  canMutateInvoice, canReadInvoice, createInvoiceDraft, invoiceDraftSchema,
  invoiceErrorResponse, invoiceListSchema, invoiceScope, listInvoices,
  migrationRequiredResponse,
} from "@/modules/invoice";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadInvoice(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = invoiceScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = invoiceListSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  return NextResponse.json(await listInvoices({ ...scope, ...parsed.data }), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  console.info("[invoice.create.request]", { requestId, step: "request_received" });
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
  console.info("[invoice.create.request]", {
    requestId,
    step: "validation_passed",
    sellerKey: parsed.data.customerKey,
    itemCount: parsed.data.itemIds.length,
  });
  try {
    const data = await createInvoiceDraft({
      ...scope,
      actorId: session.userId,
      outletCode: session.outletCode,
      requestId,
    }, parsed.data);
    console.info("[invoice.create.request]", {
      requestId,
      step: "response_created",
      invoiceId: data.id,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") {
      return migrationRequiredResponse();
    }
    return invoiceErrorResponse(error);
  }
}

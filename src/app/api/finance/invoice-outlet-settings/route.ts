import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canMutateInvoice,
  getInvoiceOutletSettings,
  invoiceErrorResponse,
  invoiceOutletSettingsSchema,
  invoiceScope,
  updateInvoiceOutletSettings,
} from "@/modules/invoice";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const scope = invoiceScope(session);
  if (!scope) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  try {
    return NextResponse.json({
      success: true,
      data: await getInvoiceOutletSettings(scope),
    });
  } catch (error) {
    return invoiceErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
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
  const parsed = invoiceOutletSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  }
  try {
    return NextResponse.json({
      success: true,
      data: await updateInvoiceOutletSettings(scope, parsed.data.adminWhatsapp),
    });
  } catch (error) {
    return invoiceErrorResponse(error);
  }
}

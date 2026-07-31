import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canMutateInvoice, invoiceErrorResponse, invoiceScope,
  migrationRequiredResponse, outletBankAccountSchema,
  updateOutletBankAccount,
} from "@/modules/invoice";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!canMutateInvoice(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = invoiceScope(session);
  if (!scope) {
    return NextResponse.json(
      { error: { code: "OUTLET_REQUIRED" } },
      { status: 400 },
    );
  }
  const parsed = outletBankAccountSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Data rekening penerima tidak valid.",
      },
    }, { status: 400 });
  }
  try {
    const data = await updateOutletBankAccount(
      scope,
      (await context.params).id,
      parsed.data,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") {
      return migrationRequiredResponse();
    }
    return invoiceErrorResponse(error);
  }
}

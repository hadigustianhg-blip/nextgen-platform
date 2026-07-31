import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canMutateInvoice, createOutletBankAccount, getActiveOutletBankAccounts,
  invoiceErrorResponse, invoiceScope, migrationRequiredResponse,
  outletBankAccountSchema,
} from "@/modules/invoice";

function contextResponse() {
  return NextResponse.json(
    { error: { code: "OUTLET_REQUIRED" } },
    { status: 400 },
  );
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!canMutateInvoice(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = invoiceScope(session);
  if (!scope) return contextResponse();
  try {
    const data = await getActiveOutletBankAccounts(scope);
    return NextResponse.json({ success: true, data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") {
      return migrationRequiredResponse();
    }
    return invoiceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!canMutateInvoice(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = invoiceScope(session);
  if (!scope) return contextResponse();
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
    const data = await createOutletBankAccount(scope, parsed.data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") {
      return migrationRequiredResponse();
    }
    return invoiceErrorResponse(error);
  }
}

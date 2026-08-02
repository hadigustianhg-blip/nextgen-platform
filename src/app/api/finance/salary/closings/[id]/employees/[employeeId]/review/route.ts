import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageSalaryAdjustment,
  reviewSalaryClosingEmployeeAdjustment,
  salaryErrorResponse,
  salaryScope,
} from "@/modules/salary";

type Context = {
  params: Promise<{ id: string; employeeId: string }>;
};

export async function POST(_: Request, context: Context) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!canManageSalaryAdjustment(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const params = await context.params;
  try {
    return NextResponse.json({
      data: await reviewSalaryClosingEmployeeAdjustment({
        ...scope,
        actorId: session.userId,
        outletCode: session.outletCode,
      }, params.id, params.employeeId),
    });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}

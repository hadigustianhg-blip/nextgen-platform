import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadSalaryRecap,
  getSalaryRecapEmployeePublication,
  salaryErrorResponse,
  salaryScope,
} from "@/modules/salary";

type Context = {
  params: Promise<{ id: string; employeeId: string }>;
};

export async function GET(_: Request, context: Context) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!canReadSalaryRecap(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const params = await context.params;
  try {
    return NextResponse.json({
      data: await getSalaryRecapEmployeePublication(
        scope,
        params.id,
        params.employeeId,
      ),
    });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}

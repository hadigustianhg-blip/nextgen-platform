import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageSalaryClosing,
  listEligibleSalaryClosingEmployees,
  salaryPreviewQuerySchema,
  salaryScope,
} from "@/modules/salary";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManageSalaryClosing(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const url = new URL(request.url);
  const parsed = salaryPreviewQuerySchema.safeParse({
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
  });
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", fields: parsed.error.flatten().fieldErrors },
    }, { status: 400 });
  }
  return NextResponse.json({
    data: await listEligibleSalaryClosingEmployees(scope, parsed.data),
  });
}

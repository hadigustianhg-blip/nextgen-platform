import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageSalaryClosing,
  canReadSalaryRecap,
  listSalaryRecaps,
  salaryScope,
} from "@/modules/salary";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadSalaryRecap(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const data = await listSalaryRecaps(scope);
  const canCancel = canManageSalaryClosing(session);
  return NextResponse.json({
    data: data.map((recap) => ({
      ...recap,
      canCancelRecap: canCancel && recap.status === "PROCESSED",
      cancelBlockReason: recap.status === "PAID"
        ? "Rekap tidak dapat dibatalkan karena pembayaran Salary sudah diproses."
        : null,
    })),
  });
}

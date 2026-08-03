import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadSalaryRecap,
  salaryScope,
} from "@/modules/salary";
import { SalaryError } from "@/modules/salary/salary.api";
import {
  createSalaryPublicationShare,
} from "@/modules/salary/salary.publication-share.service";

type Context = {
  params: Promise<{ id: string; employeeId: string }>;
};

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request, context: Context) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, {
      status: 401,
      headers: noStore,
    });
  }
  if (!canReadSalaryRecap(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, {
      status: 403,
      headers: noStore,
    });
  }
  const scope = salaryScope(session);
  if (!scope) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, {
      status: 400,
      headers: noStore,
    });
  }
  const { id, employeeId } = await context.params;
  try {
    return NextResponse.json({
      data: await createSalaryPublicationShare({
        scope,
        closingId: id,
        closingEmployeeId: employeeId,
        requestUrl: request.url,
      }),
    }, { headers: noStore });
  } catch (error) {
    const known = error instanceof SalaryError ? error : null;
    const configurationError = known?.code === "SALARY_SHARE_NOT_CONFIGURED" ||
      known?.code === "SALARY_SHARE_BASE_URL_INVALID";
    return NextResponse.json({
      error: {
        code: known?.code ?? "SALARY_SHARE_CREATE_FAILED",
        message: configurationError
          ? "Konfigurasi tautan publik Salary belum tersedia."
          : "Tautan Salary Card gagal dibuat.",
      },
    }, {
      status: known?.status ?? 500,
      headers: noStore,
    });
  }
}

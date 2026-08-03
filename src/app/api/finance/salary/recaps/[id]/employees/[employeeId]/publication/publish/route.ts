import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadSalaryRecap,
  salaryErrorResponse,
  salaryScope,
} from "@/modules/salary";
import {
  markSalaryPublicationPublished,
} from "@/modules/salary/salary.publication-share.service";

type Context = {
  params: Promise<{ id: string; employeeId: string }>;
};

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function PATCH(_request: Request, context: Context) {
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
      data: await markSalaryPublicationPublished({
        scope,
        closingId: id,
        closingEmployeeId: employeeId,
        publishedByUserId: session.userId,
      }),
    }, { headers: noStore });
  } catch (error) {
    const response = salaryErrorResponse(error);
    Object.entries(noStore).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
}

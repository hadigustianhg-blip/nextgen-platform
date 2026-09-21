import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateSalaryClosingInTransaction } from "./salary.closing.service";
import {
  createSalaryClosingInTransaction,
  type SalaryContext,
} from "./salary.service";
import { listEligibleSalaryClosingEmployees } from "./salary.preview.service";
import { SalaryError } from "./salary.api";

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 120_000,
} as const;

const retryableTransactionConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2034";

export async function createSalaryClosingFromPreview(
  context: SalaryContext,
  input: {
    startDate: string;
    endDate: string;
    notes?: string | null;
    requestId: string;
    employeeIds?: string[];
  },
) {
  const execute = () => prisma.$transaction(async (tx) => {
    const employeeIds = input.employeeIds ?? (await listEligibleSalaryClosingEmployees(
      context,
      { startDate: input.startDate, endDate: input.endDate },
      tx,
    )).map((employee) => employee.employeeId);
    if (!employeeIds.length) {
      throw new SalaryError("SALARY_CLOSING_EMPTY", 409);
    }
    const closing = await createSalaryClosingInTransaction(tx, context, {
      periodStart: input.startDate,
      periodEnd: input.endDate,
      notes: input.notes,
      employeeIds,
      requestId: input.requestId,
    }, { activeStatusesOnly: true });
    if (closing.snapshotCapturedAt) return closing;
    await tx.salaryAudit.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        actorId: context.actorId,
        action: "CREATE",
        entityType: "SALARY_CLOSING_CREATED_FROM_PREVIEW",
        entityId: closing.id,
        metadata: {
          periodStart: input.startDate,
          periodEnd: input.endDate,
          requestId: input.requestId,
        },
      },
    });
    return generateSalaryClosingInTransaction(tx, context, closing.id);
  }, transactionOptions);

  try {
    return await execute();
  } catch (error) {
    if (!retryableTransactionConflict(error)) throw error;
    return execute();
  }
}

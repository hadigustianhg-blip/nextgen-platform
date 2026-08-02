import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateSalaryClosingInTransaction } from "./salary.closing.service";
import {
  createSalaryClosingInTransaction,
  type SalaryContext,
} from "./salary.service";

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
  },
) {
  const execute = () => prisma.$transaction(async (tx) => {
    const closing = await createSalaryClosingInTransaction(tx, context, {
      periodStart: input.startDate,
      periodEnd: input.endDate,
      notes: input.notes,
    }, { activeStatusesOnly: true });
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

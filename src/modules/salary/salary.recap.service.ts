import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SalaryError } from "./salary.api";
import type { SalaryContext } from "./salary.service";

type LockedSalaryClosing = {
  id: string;
  closingNumber: string;
  status: string;
};

export async function cancelSalaryRecap(
  context: SalaryContext,
  closingId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<LockedSalaryClosing[]>(Prisma.sql`
      SELECT id, "closingNumber", status::text AS status
      FROM "SalaryClosing"
      WHERE id::text = ${closingId}
        AND "tenantId"::text = ${context.tenantId}
        AND "outletId"::text = ${context.outletId}
      FOR UPDATE
    `);
    if (!locked) throw new SalaryError("SALARY_CLOSING_NOT_FOUND", 404);

    if (locked.status === "CLOSED") {
      const previousCancellation = await tx.salaryAudit.findFirst({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: locked.id,
          entityType: "SALARY_RECAP_CANCELLED",
        },
        select: { id: true },
      });
      if (previousCancellation) {
        return {
          id: locked.id,
          closingNumber: locked.closingNumber,
          status: "CLOSED" as const,
          processedAt: null,
          processedByUserId: null,
          alreadyCancelled: true,
        };
      }
      throw new SalaryError("SALARY_RECAP_CANCEL_NOT_ALLOWED", 409);
    }
    if (locked.status === "PAID") {
      throw new SalaryError("SALARY_RECAP_PAYMENT_EXISTS", 409);
    }
    if (locked.status !== "PROCESSED") {
      throw new SalaryError("SALARY_RECAP_CANCEL_NOT_ALLOWED", 409);
    }

    const updatedClosing = await tx.salaryClosing.updateMany({
      where: {
        id: locked.id,
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "PROCESSED",
      },
      data: {
        status: "CLOSED",
        processedAt: null,
        processedByUserId: null,
      },
    });
    if (updatedClosing.count !== 1) {
      throw new SalaryError("SALARY_RECAP_CANCEL_NOT_ALLOWED", 409);
    }

    const employees = await tx.salaryClosingEmployee.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: locked.id,
      },
      data: { status: "PENDING_REVIEW" },
    });
    await tx.salaryKasbonAllocation.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "FINALIZED",
        closingEmployee: { salaryClosingId: locked.id },
      },
      data: { status: "DRAFT", finalizedAt: null },
    });

    const cancelledAt = new Date();
    const metadata = {
      closingId: locked.id,
      closingNumber: locked.closingNumber,
      actorId: context.actorId,
      reason,
      cancelledAt: cancelledAt.toISOString(),
    };
    await tx.salaryAudit.createMany({
      data: [
        {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: locked.id,
          actorId: context.actorId,
          action: "UPDATE",
          entityType: "SALARY_RECAP_CANCELLED",
          entityId: locked.id,
          metadata,
        },
        {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: locked.id,
          actorId: context.actorId,
          action: "UPDATE",
          entityType: "SALARY_CLOSING_REOPENED_FROM_RECAP",
          entityId: locked.id,
          metadata,
        },
      ],
    });

    return {
      id: locked.id,
      closingNumber: locked.closingNumber,
      status: "CLOSED" as const,
      processedAt: null,
      processedByUserId: null,
      employeeCount: employees.count,
      alreadyCancelled: false,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
}

export async function endSalaryRecapClosing(
  context: SalaryContext,
  closingId: string,
) {
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<LockedSalaryClosing[]>(Prisma.sql`
      SELECT id, "closingNumber", status::text AS status
      FROM "SalaryClosing"
      WHERE id::text = ${closingId}
        AND "tenantId"::text = ${context.tenantId}
        AND "outletId"::text = ${context.outletId}
      FOR UPDATE
    `);
    if (!locked) throw new SalaryError("SALARY_CLOSING_NOT_FOUND", 404);

    if (locked.status === "PAID") {
      const audit = await tx.salaryAudit.findFirst({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: locked.id,
          entityType: "SALARY_RECAP_ENDED_CLOSING",
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, actorId: true },
      });
      return {
        id: locked.id,
        closingNumber: locked.closingNumber,
        status: "PAID" as const,
        endedAt: audit?.createdAt ?? null,
        endedByUserId: audit?.actorId ?? null,
        alreadyEnded: true,
      };
    }

    if (locked.status !== "PROCESSED") {
      throw new SalaryError("SALARY_RECAP_END_CLOSING_NOT_ALLOWED", 409);
    }

    const endedAt = new Date();

    const updatedClosing = await tx.salaryClosing.updateMany({
      where: {
        id: locked.id,
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "PROCESSED",
      },
      data: {
        status: "PAID",
      },
    });

    if (updatedClosing.count !== 1) {
      throw new SalaryError("SALARY_RECAP_END_CLOSING_NOT_ALLOWED", 409);
    }

    await tx.salaryClosingEmployee.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: locked.id,
      },
      data: { status: "PAID" },
    });

    await tx.salaryKasbonAllocation.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        closingEmployee: { salaryClosingId: locked.id },
        status: { in: ["DRAFT", "FINALIZED"] },
      },
      data: {
        status: "FINALIZED",
        finalizedAt: endedAt,
      },
    });

    const metadata = {
      closingId: locked.id,
      closingNumber: locked.closingNumber,
      actorId: context.actorId,
      previousStatus: "PROCESSED",
      finalStatus: "PAID",
      endedAt: endedAt.toISOString(),
    };

    await tx.salaryAudit.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: locked.id,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "SALARY_RECAP_ENDED_CLOSING",
        entityId: locked.id,
        metadata,
      },
    });

    return {
      id: locked.id,
      closingNumber: locked.closingNumber,
      status: "PAID" as const,
      endedAt,
      endedByUserId: context.actorId,
      alreadyEnded: false,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
}


import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getActiveDispatchDataset } from "@/modules/delivery-settlement/active-dispatch-dataset";
import { calculateAchievement } from "@/modules/monitoring/monitoring-daily.calculation";
import { resolveOperationalBusinessDate } from "@/modules/operational-settlement/operational-settlement.service";
import { isCashSettlement } from "@/modules/pickup/pickup-settlement.service";
import {
  canonicalCourierName,
  resolveTeamAcceptedCourierNames,
  resolveTeamAcceptedPickupNames,
  teamApiErrorResponse,
  teamJson,
} from "@/modules/team";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  try {
    const session = await getAnySession();
    if (!session) {
      return teamJson({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    }
    const context = await resolveTeamContext(session);

    const [acceptedCourierNames, acceptedPickupNames] = await Promise.all([
      resolveTeamAcceptedCourierNames(context),
      resolveTeamAcceptedPickupNames(context),
    ]);

    if (acceptedCourierNames.size === 0 && acceptedPickupNames.size === 0) {
      return teamJson(
        { success: false, error: { code: "TEAM_EMPLOYEE_NOT_FOUND" } },
        { status: 404, headers: noStore },
      );
    }

    const { activeBusinessDate } = await resolveOperationalBusinessDate({
      tenantId: context.tenantId,
      outletId: context.outletId,
    });
    const operationalDate = new Date(`${activeBusinessDate}T00:00:00.000Z`);

    const [dispatches, rawPickups, masterSetorans, masterPickups] = await Promise.all([
      getActiveDispatchDataset({
        tenantId: context.tenantId,
        outletId: context.outletId,
        operationalDate,
      }),
      prisma.rawPickup.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          operationalDate,
          syncStatus: "NORMALIZED",
        },
        select: {
          id: true,
          waybillNo: true,
          staffNameRaw: true,
          settlementRaw: true,
          weight: true,
          sourceFetchedAt: true,
        },
      }),
      prisma.masterSetoran.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          operationalDate: new Date(activeBusinessDate),
        },
        include: {
          payments: {
            where: { recordStatus: "VALID" },
            orderBy: { createdAt: "desc" },
            include: {
              transfers: {
                where: { recordStatus: "VALID" },
              },
            },
          },
        },
      }),
      prisma.masterPickup.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          operationalDate: new Date(activeBusinessDate),
        },
        include: {
          rawPickup: { select: { settlementRaw: true } },
          settlementRevisions: {
            where: { recordStatus: "VALID" },
            orderBy: { revision: "desc" },
            take: 1,
            select: { discountAmount: true },
          },
          payments: {
            where: { recordStatus: "VALID" },
            select: { receivedAmount: true },
          },
        },
      }),
    ]);

    // 1. DELIVERY
    const myDispatches = dispatches.filter(
      (r) => r.courierNameRaw && acceptedCourierNames.has(canonicalCourierName(r.courierNameRaw)),
    );
    const deliveryToday = myDispatches.length;
    const deliveryTtd = myDispatches.filter(
      (r) => canonicalCourierName(r.deliveryStatusRaw) === "PENERIMAAN NORMAL",
    ).length;
    const deliveryPending = deliveryToday - deliveryTtd;
    const rawAch = calculateAchievement(deliveryTtd, deliveryToday);
    const deliveryAchievement = Math.round(rawAch * 100) / 100;

    const deliveryShipments = myDispatches.map((r) => ({
      id: r.id,
      waybillNo: r.waybillNo,
      deliveryStatus: r.deliveryStatusRaw ?? "Dalam Pengiriman",
      receiverName: r.receiverName ?? null,
      dispatchAt: r.dispatchAt ? r.dispatchAt.toISOString() : r.sourceFetchedAt.toISOString(),
      chargeWeight: r.chargeWeight ? Number(r.chargeWeight) : 0,
    }));

    // 2. PICKUP
    const myPickups = rawPickups.filter(
      (r) => r.staffNameRaw && acceptedPickupNames.has(canonicalCourierName(r.staffNameRaw)),
    );
    const pickupToday = myPickups.length;
    const pickupTotalWeight = Math.round(
      myPickups.reduce((sum, r) => sum + Number(r.weight ?? 0), 0) * 100,
    ) / 100;

    const pickupItems = myPickups.map((r) => ({
      id: r.id,
      waybillNo: r.waybillNo,
      settlementType: r.settlementRaw ?? "DFOD",
      weight: Number(r.weight ?? 0),
      fetchedAt: r.sourceFetchedAt.toISOString(),
    }));

    // 3. SETTLEMENT OBLIGATION & PAYMENTS
    const mySettlementRows = masterSetorans.filter(
      (r) => r.courierName && acceptedCourierNames.has(canonicalCourierName(r.courierName)),
    );
    const settlementRow = mySettlementRows[0] ?? null;

    let codAmount = 0;
    let dfodAmount = 0;
    let deliveryObligation = 0;
    let deliveryPaid = 0;
    let lastPaymentAt: string | null = null;
    let note: string | null = null;

    if (settlementRow) {
      codAmount = Math.round(Number(settlementRow.codCashAmount ?? 0));
      dfodAmount = Math.round(Number(settlementRow.dfodAmount ?? 0));
      deliveryObligation = Math.round(Number(settlementRow.totalSettlementAmount ?? 0));

      deliveryPaid = settlementRow.payments.reduce((sum, p) => {
        const cash = Number(p.cashAmount ?? 0);
        const transfer = p.transfers.reduce((tSum, t) => tSum + Number(t.amount ?? 0), 0);
        return sum + cash + transfer;
      }, 0);

      if (settlementRow.payments.length > 0) {
        lastPaymentAt = settlementRow.payments[0].createdAt.toISOString();
        note = settlementRow.payments[0].note;
      }
    }

    const myMasterPickups = masterPickups.filter((mp) => {
      const name = mp.staffName ?? mp.senderName;
      return name && acceptedPickupNames.has(canonicalCourierName(name));
    });

    let pickupAmount = 0;
    let pickupPaid = 0;

    for (const mp of myMasterPickups) {
      if (!isCashSettlement(mp.rawPickup.settlementRaw)) continue;
      const discount = Number(mp.settlementRevisions[0]?.discountAmount ?? 0);
      const obligation = Math.max(0, Number(mp.freightAmount ?? 0) - discount);
      pickupAmount += obligation;
      const paid = mp.payments.reduce((sum, p) => sum + Number(p.receivedAmount ?? 0), 0);
      pickupPaid += paid;
    }

    pickupAmount = Math.round(pickupAmount);
    pickupPaid = Math.round(pickupPaid);

    const totalObligation = deliveryObligation + pickupAmount;
    const paidAmount = Math.round(deliveryPaid + pickupPaid);
    const remainingAmount = Math.max(0, totalObligation - paidAmount);

    let settlementStatus = "BELUM SETOR";
    if (totalObligation === 0) {
      settlementStatus = "SELESAI";
    } else if (remainingAmount === 0) {
      settlementStatus = "SELESAI";
    } else if (paidAmount > 0) {
      settlementStatus = "SEBAGIAN";
    } else {
      settlementStatus = "BELUM SETOR";
    }

    return teamJson(
      {
        success: true,
        data: {
          businessDate: activeBusinessDate,
          employeeName: context.employeeName,
          delivery: {
            summary: {
              deliveryToday,
              totalTtd: deliveryTtd,
              pending: deliveryPending,
              achievement: deliveryAchievement,
            },
            shipments: deliveryShipments,
          },
          pickup: {
            summary: {
              pickupToday,
              totalWeight: pickupTotalWeight,
            },
            items: pickupItems,
          },
          settlement: {
            hasRecord: Boolean(settlementRow || myMasterPickups.length > 0),
            codAmount,
            dfodAmount,
            pickupAmount,
            totalObligation,
            paidAmount,
            remainingAmount,
            status: settlementStatus,
            lastPaymentAt,
            note,
          },
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    return teamApiErrorResponse(error);
  }
}

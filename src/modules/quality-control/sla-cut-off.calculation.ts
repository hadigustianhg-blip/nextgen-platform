export const SLA_TARGET = 95;

const iso = (date: Date) => date.toISOString().slice(0, 10);

export function getSlaCycle(businessDate: string) {
  const [year, month, day] = businessDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, day >= 21 ? month - 1 : month - 2, 21));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 20));
  return { startDate: iso(start), endDate: iso(end) };
}

export function isValidSlaCycle(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
  return getSlaCycle(startDate).startDate === startDate && getSlaCycle(startDate).endDate === endDate;
}

export type SlaDaily = {
  businessDate: string; sla: number; paketSampai: number;
  sudahTandaTerima: number; belumTandaTerima: number; lewatSla: number;
};

export type AgingSignRecord = {
  signTimelyTotal: number; networkName: string; signDelayOtherTotal: number;
  signTimelyRate: string; queryTime: string; sendCenterTotal: number;
  signDelayNoSignTotal: number;
};

export function normalizeAgingSign(value: unknown): AgingSignRecord {
  const record = value as Partial<AgingSignRecord>;
  if (!record || typeof record.queryTime !== "string" || typeof record.networkName !== "string" || typeof record.signTimelyRate !== "string") {
    throw new Error("Respons jfs-aging-sign tidak valid.");
  }
  const number = (input: unknown) => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) throw new Error("Nilai numerik jfs-aging-sign tidak valid.");
    return parsed;
  };
  return { queryTime: record.queryTime, networkName: record.networkName, signTimelyRate: record.signTimelyRate,
    sendCenterTotal: number(record.sendCenterTotal), signTimelyTotal: number(record.signTimelyTotal),
    signDelayNoSignTotal: number(record.signDelayNoSignTotal), signDelayOtherTotal: number(record.signDelayOtherTotal) };
}

export function summarizeSla(rows: SlaDaily[]) {
  const sum = (key: keyof SlaDaily) => rows.reduce((total, row) => total + Number(row[key]), 0);
  const averageSla = rows.length ? sum("sla") / rows.length : 0;
  return {
    averageSla: Number(averageSla.toFixed(2)),
    totalPaketSampai: sum("paketSampai"),
    sudahTandaTerima: sum("sudahTandaTerima"),
    belumTandaTerima: sum("belumTandaTerima"),
    lewatSla: sum("lewatSla"),
    hariAchieve: rows.filter((row) => row.sla >= SLA_TARGET).length,
    hariNotAchieve: rows.filter((row) => row.sla < SLA_TARGET).length,
    status: averageSla >= SLA_TARGET ? "ACHIEVE" as const : "NOT_ACHIEVE" as const,
  };
}

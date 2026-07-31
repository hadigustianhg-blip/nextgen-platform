export const SALARY_DISPATCH_STATUS = "Penerimaan Normal";
export const SALARY_DELIVERY_SOURCE = "RAW_DISPATCH";
export const SALARY_PICKUP_SOURCE = "RAW_PICKUP";
export const SALARY_PICKUP_SETTLEMENTS = {
  REGULAR: ["DFOD", "Tunai"],
  MARKETPLACE: ["Bulanan"],
} as const;

export function normalizeSalarySettlement(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") ?? "";
}

export function isSalarySettlement(
  value: string | null | undefined,
  canonicalValue: "DFOD" | "Tunai" | "Bulanan",
) {
  return normalizeSalarySettlement(value) ===
    normalizeSalarySettlement(canonicalValue);
}

export function normalizeSalaryDispatchStatus(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") ?? "";
}

export function isSalaryEligibleDispatchStatus(
  value: string | null | undefined,
) {
  return normalizeSalaryDispatchStatus(value) ===
    normalizeSalaryDispatchStatus(SALARY_DISPATCH_STATUS);
}

export const salaryDivisionLabels = {
  ADMIN: "Admin",
  ADMIN_OPS: "Admin Ops",
  SALES: "Sales",
  THREE_WHEEL_DRIVER: "Driver Roda Tiga",
  MOTORIST: "Motoris",
  DRIVER: "Driver",
} as const;

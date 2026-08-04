import { canAccessResource, type PermissionResource } from "@/lib/permissions";

export type AppNavigationItem = {
  label: string;
  href: string;
  section: string;
  resource: PermissionResource;
  keywords?: readonly string[];
};

// Search-only, read-only index of routes already exposed by the existing sidebar.
const appNavigation: readonly AppNavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", section: "Utama", resource: "DASHBOARD", keywords: ["beranda", "overview"] },
  { label: "Monitoring Daily", href: "/dashboard/monitoring/daily", section: "Monitoring", resource: "MONITORING" },
  { label: "Monitoring Monthly", href: "/dashboard/monitoring/monthly", section: "Monitoring", resource: "MONITORING" },
  { label: "Pickup Settlement", href: "/dashboard/settlement/pickup", section: "Settlement Center", resource: "PICKUP_SETTLEMENT" },
  { label: "Delivery Settlement", href: "/dashboard/settlement/delivery", section: "Settlement Center", resource: "DELIVERY_SETTLEMENT" },
  { label: "Operational Settlement", href: "/dashboard/settlement/operational", section: "Settlement Center", resource: "OPERATIONAL_SETTLEMENT" },
  { label: "Payment Settlement", href: "/dashboard/payment/settlement", section: "Payment", resource: "PAYMENT_SETTLEMENT" },
  { label: "Pickup Payment", href: "/dashboard/payment/pickup", section: "Payment", resource: "PICKUP_PAYMENT" },
  { label: "Cash Flow Payment", href: "/dashboard/payment/cash-flow", section: "Payment", resource: "PAYMENT_SETTLEMENT" },
  { label: "SLA Cut Off", href: "/dashboard/quality-control/sla-cut-off", section: "Quality Control", resource: "QUALITY_CONTROL" },
  { label: "Waybill Stuck Delivery", href: "/dashboard/quality-control/waybill-stuck-delivery", section: "Quality Control", resource: "QUALITY_CONTROL" },
  { label: "Problem Waybill Delivery", href: "/dashboard/quality-control/problem-waybill-delivery", section: "Quality Control", resource: "QUALITY_CONTROL" },
  { label: "Penjadwalan Pickup", href: "/dashboard/quality-control/pickup-scheduling", section: "Quality Control", resource: "QUALITY_CONTROL" },
  { label: "Rincian Operasional", href: "/dashboard/finance/rincian-operasional", section: "Finance & HR", resource: "OPERATIONAL_DETAIL" },
  { label: "Profit Loss", href: "/dashboard/finance/cashflow-jfs", section: "Finance & HR", resource: "PROFIT_LOSS", keywords: ["cashflow jfs"] },
  { label: "Create Invoice", href: "/dashboard/finance/create-invoice", section: "Finance & HR", resource: "INVOICE" },
  { label: "Salary Setting", href: "/dashboard/finance/salary-setting", section: "Finance & HR", resource: "SALARY_SETTING" },
  { label: "Salary Closing", href: "/dashboard/finance/salary-closing", section: "Finance & HR", resource: "SALARY_CLOSING" },
  { label: "Salary Recap", href: "/dashboard/finance/salary-recap", section: "Finance & HR", resource: "SALARY_RECAP" },
  { label: "Profil Bisnis", href: "/dashboard/settings/business-profile", section: "Pengaturan", resource: "SETTINGS_PROFILE" },
  { label: "User & Hak Akses", href: "/dashboard/settings/users", section: "Pengaturan", resource: "SETTINGS_USERS" },
  { label: "Target & KPI", href: "/dashboard/settings/target-kpi", section: "Pengaturan", resource: "SETTINGS_TARGET_KPI", keywords: ["target", "kpi"] },
  { label: "Finance", href: "/dashboard/settings/finance", section: "Pengaturan", resource: "SETTINGS_FINANCE" },
  { label: "Integrasi", href: "/dashboard/settings/integrations", section: "Pengaturan", resource: "SETTINGS_INTEGRATIONS" },
  { label: "Maintenance", href: "/dashboard/settings/maintenance", section: "Pengaturan", resource: "SETTINGS_MAINTENANCE" },
  { label: "Audit Log", href: "/dashboard/settings/audit-logs", section: "Pengaturan", resource: "SETTINGS_AUDIT" },
];

export function getSearchableNavigation(roles: readonly string[]) {
  return appNavigation.filter((item) => canAccessResource(roles, item.resource, "READ"));
}

const normalizeSearchText = (value: string) =>
  value.normalize("NFKD").toLocaleLowerCase("id-ID").trim();

export function filterNavigationItems(
  items: readonly AppNavigationItem[],
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return items.filter((item) => normalizeSearchText([
    item.label,
    item.section,
    ...(item.keywords ?? []),
  ].join(" ")).includes(normalizedQuery));
}

export function moveNavigationIndex(
  current: number,
  direction: 1 | -1,
  total: number,
) {
  if (total <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}

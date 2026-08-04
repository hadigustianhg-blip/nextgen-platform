export type AppNavigationItem = {
  label: string;
  href: string;
  section: string;
  settingsOnly?: boolean;
  keywords?: readonly string[];
};

// Search-only, read-only index of routes already exposed by the existing sidebar.
const appNavigation: readonly AppNavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", section: "Utama", keywords: ["beranda", "overview"] },
  { label: "Monitoring Daily", href: "/dashboard/monitoring/daily", section: "Monitoring" },
  { label: "Monitoring Monthly", href: "/dashboard/monitoring/monthly", section: "Monitoring" },
  { label: "Pickup Settlement", href: "/dashboard/settlement/pickup", section: "Settlement Center" },
  { label: "Delivery Settlement", href: "/dashboard/settlement/delivery", section: "Settlement Center" },
  { label: "Operational Settlement", href: "/dashboard/settlement/operational", section: "Settlement Center" },
  { label: "Payment Settlement", href: "/dashboard/payment/settlement", section: "Payment" },
  { label: "Pickup Payment", href: "/dashboard/payment/pickup", section: "Payment" },
  { label: "Cash Flow Payment", href: "/dashboard/payment/cash-flow", section: "Payment" },
  { label: "SLA Cut Off", href: "/dashboard/quality-control/sla-cut-off", section: "Quality Control" },
  { label: "Waybill Stuck Delivery", href: "/dashboard/quality-control/waybill-stuck-delivery", section: "Quality Control" },
  { label: "Problem Waybill Delivery", href: "/dashboard/quality-control/problem-waybill-delivery", section: "Quality Control" },
  { label: "Penjadwalan Pickup", href: "/dashboard/quality-control/pickup-scheduling", section: "Quality Control" },
  { label: "Rincian Operasional", href: "/dashboard/finance/rincian-operasional", section: "Finance & HR" },
  { label: "Profit Loss", href: "/dashboard/finance/cashflow-jfs", section: "Finance & HR", keywords: ["cashflow jfs"] },
  { label: "Create Invoice", href: "/dashboard/finance/create-invoice", section: "Finance & HR" },
  { label: "Salary Setting", href: "/dashboard/finance/salary-setting", section: "Finance & HR" },
  { label: "Salary Closing", href: "/dashboard/finance/salary-closing", section: "Finance & HR" },
  { label: "Salary Recap", href: "/dashboard/finance/salary-recap", section: "Finance & HR" },
  { label: "Profil Bisnis", href: "/dashboard/settings/business-profile", section: "Pengaturan", settingsOnly: true },
  { label: "User & Hak Akses", href: "/dashboard/settings/users", section: "Pengaturan", settingsOnly: true },
  { label: "Finance", href: "/dashboard/settings/finance", section: "Pengaturan", settingsOnly: true },
  { label: "Integrasi", href: "/dashboard/settings/integrations", section: "Pengaturan", settingsOnly: true },
  { label: "Maintenance", href: "/dashboard/settings/maintenance", section: "Pengaturan", settingsOnly: true },
  { label: "Audit Log", href: "/dashboard/settings/audit-logs", section: "Pengaturan", settingsOnly: true },
];

export function getSearchableNavigation(settingsAllowed: boolean) {
  return appNavigation.filter((item) => !item.settingsOnly || settingsAllowed);
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

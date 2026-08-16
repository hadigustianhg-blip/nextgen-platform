"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NextgenBrand } from "@/components/ui";
import { canAccessResource } from "@/lib/permissions";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  CircleGauge,
  CreditCard,
  FileCheck2,
  LogOut,
  Menu,
  PackageCheck,
  ReceiptText,
  Settings,
  ShieldCheck,
  Truck,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", icon: CircleGauge, href: "/dashboard" },
  { label: "Monitoring", icon: BarChart3, href: "#monitoring" },
  { label: "Payment", icon: CreditCard, href: "#payment" },
  { label: "Quality Control", icon: ShieldCheck, href: "#quality-control" },
  { label: "Finance & HR", icon: UsersRound, href: "#finance-hr" },
  { label: "Pengaturan", icon: Settings, href: "#settings" },
] satisfies ReadonlyArray<{
  label: string;
  icon: typeof CircleGauge;
  href: string;
}>;

const storageKeys = {
  collapsed: "nextgen.sidebar.collapsed",
  openGroup: "nextgen.sidebar.open-group",
} as const;

export type SidebarGroup =
  | "monitoring"
  | "settlement"
  | "payment"
  | "quality-control"
  | "finance"
  | "settings";

const sidebarGroups: SidebarGroup[] = [
  "monitoring",
  "settlement",
  "payment",
  "quality-control",
  "finance",
  "settings",
];

export type SidebarAccordionState = {
  pathname: string;
  openGroupId: SidebarGroup | null;
};

export function resolveSidebarOpenGroup(
  pathname: string,
  activeGroup: SidebarGroup | null,
  state: SidebarAccordionState,
) {
  return state.pathname === pathname ? state.openGroupId : activeGroup;
}

export function toggleSidebarGroup(
  pathname: string,
  openGroupId: SidebarGroup | null,
  group: SidebarGroup,
): SidebarAccordionState {
  return {
    pathname,
    openGroupId: openGroupId === group ? null : group,
  };
}

const readStoredBoolean = (key: string, fallback: boolean) => {
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === "true";
};

export function Sidebar({ roles }: { roles: readonly string[] }) {
  const pathname = usePathname();
  const monitoringActive = pathname.startsWith("/dashboard/monitoring/");
  const settlementActive = pathname.startsWith("/dashboard/settlement/");
  const paymentActive = pathname.startsWith("/dashboard/payment/");
  const qualityControlActive = pathname.startsWith("/dashboard/quality-control/");
  const financeActive = pathname.startsWith("/dashboard/finance/") || pathname.startsWith("/dashboard/hr/");
  const settingsActive = pathname.startsWith("/dashboard/settings/");
  const [collapsed, setCollapsed] = useState(false);
  const activeGroup: SidebarGroup | null = monitoringActive
    ? "monitoring"
    : settlementActive
      ? "settlement"
      : paymentActive
        ? "payment"
        : qualityControlActive
          ? "quality-control"
          : financeActive
            ? "finance"
            : settingsActive
              ? "settings"
              : null;
  const [accordionState, setAccordionState] = useState<SidebarAccordionState>({
    pathname,
    openGroupId: activeGroup,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setCollapsed(readStoredBoolean(storageKeys.collapsed, false));
      const storedGroup = window.localStorage.getItem(storageKeys.openGroup);
      const validStoredGroup = sidebarGroups.includes(storedGroup as SidebarGroup)
        ? (storedGroup as SidebarGroup)
        : null;
      setAccordionState((current) => current.openGroupId === null
        ? { ...current, openGroupId: validStoredGroup }
        : current);
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(storageKeys.collapsed, String(collapsed));
    }
  }, [collapsed, storageReady]);

  const openGroupId = resolveSidebarOpenGroup(pathname, activeGroup, accordionState);

  useEffect(() => {
    if (!storageReady) return;
    if (openGroupId) {
      window.localStorage.setItem(storageKeys.openGroup, openGroupId);
    } else {
      window.localStorage.removeItem(storageKeys.openGroup);
    }
  }, [openGroupId, storageReady]);

  const monitoringVisible = openGroupId === "monitoring";
  const settlementVisible = openGroupId === "settlement";
  const paymentVisible = openGroupId === "payment";
  const qualityControlVisible = openGroupId === "quality-control";
  const financeVisible = openGroupId === "finance";
  const settingsVisible = openGroupId === "settings";
  const settingsAllowed = canAccessResource(roles, "SETTINGS_PROFILE", "READ");
  const canReadProfitLoss = canAccessResource(roles, "PROFIT_LOSS", "READ");
  const canReadSalarySetting = canAccessResource(roles, "SALARY_SETTING", "READ");
  const canReadSalaryClosing = canAccessResource(roles, "SALARY_CLOSING", "READ");
  const canReadSalaryRecap = canAccessResource(roles, "SALARY_RECAP", "READ");
  const canReadAttendance = canAccessResource(roles, "ATTENDANCE", "READ");
  const canReadLeave = canAccessResource(roles, "LEAVE_MANAGEMENT", "READ");
  const toggleGroup = (group: SidebarGroup) => {
    setAccordionState(toggleSidebarGroup(pathname, openGroupId, group));
  };
  const labelClass = collapsed ? "lg:hidden" : "";
  const closeMobile = () => setMobileOpen(false);
  const itemLayout = collapsed ? "lg:justify-center lg:gap-0" : "";
  const childLayout = collapsed
    ? "lg:ml-0 lg:justify-center lg:px-3"
    : "lg:ml-3";
  const submenuLayout = collapsed ? "lg:ml-0 lg:border-l-0 lg:pl-0" : "";

  return (
    <>
      <button
        type="button"
        aria-label="Buka navigasi"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-xl border border-blue-100 bg-white p-2.5 text-[var(--nextgen-primary)] shadow-lg shadow-slate-950/10 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden"
      >
        <Menu size={20} />
      </button>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/45 lg:hidden"
          aria-label="Tutup navigasi"
          onClick={closeMobile}
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-white/[0.08] bg-[#0b1739] text-white shadow-[12px_0_40px_rgba(2,6,23,0.12)] transition-[width,transform] duration-300 ease-out before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-64 before:bg-gradient-to-b before:from-blue-500/[0.12] before:to-transparent",
          collapsed ? "lg:w-[88px]" : "lg:w-[272px]",
          mobileOpen
            ? "w-[280px] translate-x-0"
            : "w-[280px] -translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="relative flex h-[88px] items-center border-b border-white/[0.08] px-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/[0.08] ring-1 ring-inset ring-white/10 shadow-lg shadow-slate-950/20"><NextgenBrand variant="mark" className="size-10 shrink-0" priority /></span>
          <div className={`ml-3 min-w-0 ${labelClass}`}>
            <div className="text-[15px] font-bold tracking-[0.18em]">NEXTGEN</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-200/75">Operations System</div>
          </div>
          <button
            type="button"
            aria-label="Tutup navigasi"
            onClick={closeMobile}
            className="ml-auto rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-300 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          className="mt-5 relative flex-1 space-y-1 overflow-y-auto px-3.5 pb-4 pt-5 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin]"
          aria-label="Navigasi utama"
        >
          {navigation.slice(0, 1).map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  setAccordionState({ pathname, openGroupId: null });
                  closeMobile();
                }}
                className={[
                  "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-blue-300",
                  active
                    ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-950/30 ring-1 ring-inset ring-white/15"
                    : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                  itemLayout,
                ].join(" ")}
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-[10px] transition ${active ? "bg-white/15" : "bg-white/[0.055] group-hover:bg-white/10"}`}><item.icon size={18} /></span>
                <span className={labelClass}>{item.label}</span>
              </Link>
            );
          })}

          <div className="pt-1">
            <button
              type="button"
              title={collapsed ? "Monitoring" : undefined}
              aria-expanded={monitoringVisible}
              aria-controls="monitoring-submenu"
              onClick={() => toggleGroup("monitoring")}
              className={[
                "group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 outline-none transition-all hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300 aria-expanded:bg-white/[0.065] aria-expanded:text-white",
                itemLayout,
              ].join(" ")}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.055] transition group-hover:bg-white/10"><BarChart3 size={18} /></span>
              <span className={labelClass}>Monitoring</span>
              <ChevronDown
                size={15}
                className={`${labelClass} ml-auto transition-transform ${monitoringVisible ? "rotate-180" : ""}`}
              />
            </button>
            {monitoringVisible && (
              <div id="monitoring-submenu" className={`ml-7 border-l border-blue-300/20 py-1 pl-1.5 ${submenuLayout}`}>
                <SidebarChild
                  href="/dashboard/monitoring/daily"
                  label="Monitoring Daily"
                  active={pathname.startsWith("/dashboard/monitoring/daily")}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<BarChart3 size={17} />}
                />
                <SidebarChild
                  href="/dashboard/monitoring/monthly"
                  label="Monitoring Monthly"
                  active={pathname.startsWith("/dashboard/monitoring/monthly")}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<CalendarDays size={17} />}
                />
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              type="button"
              title={collapsed ? "Settlement Center" : undefined}
              aria-expanded={settlementVisible}
              aria-controls="settlement-submenu"
              onClick={() => toggleGroup("settlement")}
              className={[
                "group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 outline-none transition-all hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300 aria-expanded:bg-white/[0.065] aria-expanded:text-white",
                itemLayout,
              ].join(" ")}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.055] transition group-hover:bg-white/10"><WalletCards size={18} /></span>
              <span className={labelClass}>Settlement Center</span>
              <ChevronDown
                size={15}
                className={`${labelClass} ml-auto transition-transform ${settlementVisible ? "rotate-180" : ""}`}
              />
            </button>
            {settlementVisible && (
              <div id="settlement-submenu" className={`ml-7 border-l border-blue-300/20 py-1 pl-1.5 ${submenuLayout}`}>
                <SidebarChild
                  href="/dashboard/settlement/pickup"
                  label="Pickup Settlement"
                  active={pathname.startsWith("/dashboard/settlement/pickup")}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<PackageCheck size={17} />}
                />
                <SidebarChild
                  href="/dashboard/settlement/delivery"
                  label="Delivery Settlement"
                  active={pathname.startsWith("/dashboard/settlement/delivery")}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<Truck size={17} />}
                />
                <SidebarChild
                  href="/dashboard/settlement/operational"
                  label="Operational Settlement"
                  active={pathname.startsWith(
                    "/dashboard/settlement/operational",
                  )}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<ReceiptText size={17} />}
                />
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              type="button"
              title={collapsed ? "Payment" : undefined}
              aria-expanded={paymentVisible}
              aria-controls="payment-submenu"
              onClick={() => toggleGroup("payment")}
              className={[
                "group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 outline-none transition-all hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300 aria-expanded:bg-white/[0.065] aria-expanded:text-white",
                itemLayout,
              ].join(" ")}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.055] transition group-hover:bg-white/10"><CreditCard size={18} /></span>
              <span className={labelClass}>Payment</span>
              <ChevronDown
                size={15}
                className={`${labelClass} ml-auto transition-transform ${paymentVisible ? "rotate-180" : ""}`}
              />
            </button>
            {paymentVisible && (
              <div id="payment-submenu" className={`ml-7 border-l border-blue-300/20 py-1 pl-1.5 ${submenuLayout}`}>
                <SidebarChild
                  href="/dashboard/payment/settlement"
                  label="Payment Settlement"
                  active={pathname.startsWith("/dashboard/payment/settlement")}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<WalletCards size={17} />}
                />
                <SidebarChild
                  href="/dashboard/payment/pickup"
                  label="Pickup Payment"
                  active={pathname.startsWith("/dashboard/payment/pickup")}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<PackageCheck size={17} />}
                />
                <SidebarChild
                  href="/dashboard/payment/cash-flow"
                  label="Cash Flow Payment"
                  active={pathname.startsWith("/dashboard/payment/cash-flow")}
                  collapsed={collapsed}
                  labelClass={labelClass}
                  layoutClass={childLayout}
                  onNavigate={closeMobile}
                  icon={<ReceiptText size={17} />}
                />
              </div>
            )}
          </div>

          <div className="pt-1">
            <button type="button" title={collapsed ? "Quality Control" : undefined}
              aria-expanded={qualityControlVisible} aria-controls="quality-control-submenu"
              onClick={() => toggleGroup("quality-control")}
              className={["group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 outline-none transition-all hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300 aria-expanded:bg-white/[0.065] aria-expanded:text-white", itemLayout].join(" ")}>
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.055] transition group-hover:bg-white/10"><ShieldCheck size={18} /></span>
              <span className={labelClass}>Quality Control</span>
              <ChevronDown size={15} className={`${labelClass} ml-auto transition-transform ${qualityControlVisible ? "rotate-180" : ""}`} />
            </button>
            {qualityControlVisible && <div id="quality-control-submenu" className={`ml-7 border-l border-blue-300/20 py-1 pl-1.5 ${submenuLayout}`}>
              <SidebarChild href="/dashboard/quality-control/sla-cut-off" label="SLA Cut Off"
                active={pathname.startsWith("/dashboard/quality-control/sla-cut-off")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<ShieldCheck size={17}/>} />
              <SidebarChild href="/dashboard/quality-control/waybill-stuck-delivery" label="Problem Waybill Stuck"
                active={pathname.startsWith("/dashboard/quality-control/waybill-stuck-delivery")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<PackageCheck size={17}/>} />
              <SidebarChild href="/dashboard/quality-control/problem-waybill-delivery" label="Problem Waybill Delivery"
                active={pathname.startsWith("/dashboard/quality-control/problem-waybill-delivery")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<Truck size={17}/>} />
              <SidebarChild href="/dashboard/quality-control/pickup-scheduling" label="Penjadwalan Pickup"
                active={pathname.startsWith("/dashboard/quality-control/pickup-scheduling")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<CalendarDays size={17}/>} />
            </div>}
          </div>

          <div className="pt-1">
            <button type="button" title={collapsed ? "Finance & HR" : undefined}
              aria-expanded={financeVisible} aria-controls="finance-submenu"
              onClick={() => toggleGroup("finance")}
              className={["group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 outline-none transition-all hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300 aria-expanded:bg-white/[0.065] aria-expanded:text-white", itemLayout].join(" ")}>
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.055] transition group-hover:bg-white/10"><UsersRound size={18} /></span>
              <span className={labelClass}>Finance & HR</span>
              <ChevronDown size={15} className={`${labelClass} ml-auto transition-transform ${financeVisible ? "rotate-180" : ""}`} />
            </button>
            {financeVisible && <div id="finance-submenu" className={`ml-7 border-l border-blue-300/20 py-1 pl-1.5 ${submenuLayout}`}>
              {canReadAttendance && <SidebarChild href="/dashboard/hr/attendance" label="Absensi"
                active={pathname.startsWith("/dashboard/hr/attendance")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<CalendarDays size={17}/>} />}
              {canReadLeave && <SidebarChild href="/dashboard/hr/leave" label="Pengajuan Team"
                active={pathname.startsWith("/dashboard/hr/leave")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<FileCheck2 size={17}/>} />}
              <SidebarChild href="/dashboard/finance/rincian-operasional" label="Rincian Operasional"
                active={pathname.startsWith("/dashboard/finance/rincian-operasional")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<ReceiptText size={17}/>} />
              {canReadProfitLoss && <SidebarChild href="/dashboard/finance/cashflow-jfs" label="Profit Loss"
                active={pathname.startsWith("/dashboard/finance/cashflow-jfs")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<WalletCards size={17}/>} />}
              <SidebarChild href="/dashboard/finance/create-invoice" label="Create Invoice"
                active={pathname.startsWith("/dashboard/finance/create-invoice")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<FileCheck2 size={17}/>} />
              {canReadSalarySetting && <SidebarChild href="/dashboard/finance/salary-setting" label="Salary Setting"
                active={pathname.startsWith("/dashboard/finance/salary-setting")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<Settings size={17}/>} />}
              {canReadSalaryClosing && <SidebarChild href="/dashboard/finance/salary-closing" label="Salary Closing"
                active={pathname.startsWith("/dashboard/finance/salary-closing")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<CalendarDays size={17}/>} />}
              {canReadSalaryRecap && <SidebarChild href="/dashboard/finance/salary-recap" label="Salary Recap"
                active={pathname.startsWith("/dashboard/finance/salary-recap")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<WalletCards size={17}/>} />}
            </div>}
          </div>

          {settingsAllowed && <div className="pt-1">
            <button type="button" title={collapsed ? "Pengaturan" : undefined}
              aria-expanded={settingsVisible} aria-controls="settings-submenu"
              onClick={() => toggleGroup("settings")}
              className={["group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 outline-none transition-all hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300 aria-expanded:bg-white/[0.065] aria-expanded:text-white", itemLayout].join(" ")}>
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.055] transition group-hover:bg-white/10"><Settings size={18} /></span>
              <span className={labelClass}>Pengaturan</span>
              <ChevronDown size={15} className={`${labelClass} ml-auto transition-transform ${settingsVisible ? "rotate-180" : ""}`} />
            </button>
            {settingsVisible && <div id="settings-submenu" className={`ml-7 border-l border-blue-300/20 py-1 pl-1.5 ${submenuLayout}`}>
              {[
                ["Profil Bisnis", "/dashboard/settings/business-profile"],
                ["User & Hak Akses", "/dashboard/settings/users"],
                ["Target & KPI", "/dashboard/settings/target-kpi"],
                ["Finance", "/dashboard/settings/finance"],
                ["Integrasi", "/dashboard/settings/integrations"],
                ["Maintenance", "/dashboard/settings/maintenance"],
                ["Audit Log", "/dashboard/settings/audit-logs"],
              ].map(([label, href]) => <SidebarChild key={href} href={href} label={label}
                active={pathname.startsWith(href)} collapsed={collapsed} labelClass={labelClass}
                layoutClass={childLayout} onNavigate={closeMobile} icon={<Settings size={17}/>} />)}
            </div>}
          </div>}

          {navigation
            .slice(1)
            .filter(
              (item) => item.label !== "Monitoring" && item.label !== "Payment" && item.label !== "Quality Control" && item.label !== "Finance & HR" && item.label !== "Pengaturan",
            )
            .map((item) => {
              const active =
                item.href.startsWith("/") && pathname.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  onClick={closeMobile}
                  className={[
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-300",
                    active
                      ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30"
                      : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                    itemLayout,
                  ].join(" ")}
                >
                  <item.icon size={19} className="shrink-0" />
                  <span className={labelClass}>{item.label}</span>
                </Link>
              );
            })}
        </nav>

        <form
          action="/api/auth/logout"
          method="post"
          className="relative border-t border-white/[0.08] bg-slate-950/10 p-3.5"
        >
          <button
            type="submit"
            title={collapsed ? "Logout" : undefined}
            className={[
              "flex h-11 w-full items-center gap-3 rounded-xl border border-transparent px-3 text-sm font-semibold text-slate-300 outline-none transition-all hover:border-red-300/10 hover:bg-red-500/10 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-red-300",
              itemLayout,
            ].join(" ")}
          >
            <LogOut size={19} className="shrink-0" />
            <span className={labelClass}>Logout</span>
          </button>
        </form>
        <button
          type="button"
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="absolute -right-3 top-[92px] hidden size-7 place-items-center rounded-full border border-blue-100 bg-white text-[var(--nextgen-primary)] shadow-lg shadow-slate-950/10 outline-none transition hover:scale-105 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transform-none lg:grid"
        >
          <ChevronLeft
            size={15}
            className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </aside>
      <div
        aria-hidden="true"
        className={[
          "hidden shrink-0 transition-[width] duration-300 ease-out lg:block",
          collapsed ? "lg:w-[88px]" : "lg:w-[272px]",
        ].join(" ")}
      />
    </>
  );
}

function SidebarChild({
  href,
  label,
  active,
  collapsed,
  labelClass,
  layoutClass,
  onNavigate,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  labelClass: string;
  layoutClass: string;
  onNavigate: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={[
        "group mt-1 flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-blue-300",
        active
          ? "bg-blue-500/95 text-white shadow-md shadow-blue-950/20 ring-1 ring-inset ring-white/10"
          : "text-slate-300/90 hover:translate-x-0.5 hover:bg-white/[0.065] hover:text-white motion-reduce:transform-none",
        layoutClass,
      ].join(" ")}
    >
      <span className={`grid size-6 shrink-0 place-items-center rounded-md transition ${active ? "bg-white/15" : "text-blue-200/80 group-hover:text-white"}`}>{icon}</span>
      <span className={labelClass}>{label}</span>
    </Link>
  );
}

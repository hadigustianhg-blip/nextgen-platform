"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  monitoringOpen: "nextgen.sidebar.monitoring.open",
  settlementOpen: "nextgen.sidebar.settlement.open",
  paymentOpen: "nextgen.sidebar.payment.open",
  qualityControlOpen: "nextgen.sidebar.quality-control.open",
  financeOpen: "nextgen.sidebar.finance.open",
} as const;

const readStoredBoolean = (key: string, fallback: boolean) => {
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === "true";
};

export function Sidebar({ outletCode }: { outletCode: string | null }) {
  const pathname = usePathname();
  const monitoringActive = pathname.startsWith("/dashboard/monitoring/");
  const settlementActive = pathname.startsWith("/dashboard/settlement/");
  const paymentActive = pathname.startsWith("/dashboard/payment/");
  const qualityControlActive = pathname.startsWith("/dashboard/quality-control/");
  const financeActive = pathname.startsWith("/dashboard/finance/");
  const [collapsed, setCollapsed] = useState(false);
  const [monitoringOpen, setMonitoringOpen] = useState(monitoringActive);
  const [settlementOpen, setSettlementOpen] = useState(settlementActive);
  const [paymentOpen, setPaymentOpen] = useState(paymentActive);
  const [qualityControlOpen, setQualityControlOpen] = useState(qualityControlActive);
  const [financeOpen, setFinanceOpen] = useState(financeActive);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setCollapsed(readStoredBoolean(storageKeys.collapsed, false));
      setMonitoringOpen(readStoredBoolean(storageKeys.monitoringOpen, true));
      setSettlementOpen(readStoredBoolean(storageKeys.settlementOpen, true));
      setPaymentOpen(readStoredBoolean(storageKeys.paymentOpen, true));
      setQualityControlOpen(readStoredBoolean(storageKeys.qualityControlOpen, true));
      setFinanceOpen(readStoredBoolean(storageKeys.financeOpen, true));
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(
        storageKeys.monitoringOpen,
        String(monitoringOpen),
      );
    }
  }, [monitoringOpen, storageReady]);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(storageKeys.collapsed, String(collapsed));
    }
  }, [collapsed, storageReady]);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(
        storageKeys.settlementOpen,
        String(settlementOpen),
      );
    }
  }, [settlementOpen, storageReady]);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(storageKeys.paymentOpen, String(paymentOpen));
    }
  }, [paymentOpen, storageReady]);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(storageKeys.qualityControlOpen, String(qualityControlOpen));
    }
  }, [qualityControlOpen, storageReady]);

  useEffect(() => {
    if (storageReady) {
      window.localStorage.setItem(storageKeys.financeOpen, String(financeOpen));
    }
  }, [financeOpen, storageReady]);

  const monitoringVisible = monitoringActive || monitoringOpen;
  const settlementVisible = settlementActive || settlementOpen;
  const paymentVisible = paymentActive || paymentOpen;
  const qualityControlVisible = qualityControlActive || qualityControlOpen;
  const financeVisible = financeActive || financeOpen;
  const labelClass = collapsed ? "lg:hidden" : "";
  const closeMobile = () => setMobileOpen(false);
  const itemLayout = collapsed ? "lg:justify-center lg:gap-0" : "";
  const childLayout = collapsed
    ? "lg:ml-0 lg:justify-center lg:px-3"
    : "lg:ml-5";

  return (
    <>
      <button
        type="button"
        aria-label="Buka navigasi"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden"
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
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-[#0b1739] text-white transition-[width,transform] duration-300 ease-out",
          collapsed ? "lg:w-[86px]" : "lg:w-[264px]",
          mobileOpen
            ? "w-[280px] translate-x-0"
            : "w-[280px] -translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-20 items-center border-b border-white/10 px-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500 font-black tracking-tight">
            N
          </div>
          <div className={`ml-3 min-w-0 ${labelClass}`}>
            <div className="font-extrabold tracking-[0.16em]">NEXTGEN</div>
            <div className="text-[11px] text-blue-200">Operations System</div>
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

        <div
          className={`mx-4 mt-5 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 ${collapsed ? "lg:hidden" : ""}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">
            Outlet aktif
          </p>
          <p className="mt-1 text-sm font-semibold">
            {outletCode ?? "Semua Outlet"}
          </p>
        </div>

        <nav
          className="mt-5 flex-1 space-y-1 overflow-y-auto px-3"
          aria-label="Navigasi utama"
        >
          {navigation.slice(0, 1).map((item) => {
            const active = pathname === item.href;
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

          <div className="pt-1">
            <button
              type="button"
              title={collapsed ? "Monitoring" : undefined}
              aria-expanded={monitoringVisible}
              aria-controls="monitoring-submenu"
              onClick={() => setMonitoringOpen((value) => !value)}
              className={[
                "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300",
                itemLayout,
              ].join(" ")}
            >
              <BarChart3 size={19} className="shrink-0" />
              <span className={labelClass}>Monitoring</span>
              <ChevronDown
                size={15}
                className={`${labelClass} ml-auto transition-transform ${monitoringVisible ? "rotate-180" : ""}`}
              />
            </button>
            {monitoringVisible && (
              <div id="monitoring-submenu">
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
              onClick={() => setSettlementOpen((value) => !value)}
              className={[
                "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300",
                itemLayout,
              ].join(" ")}
            >
              <WalletCards size={19} className="shrink-0" />
              <span className={labelClass}>Settlement Center</span>
              <ChevronDown
                size={15}
                className={`${labelClass} ml-auto transition-transform ${settlementVisible ? "rotate-180" : ""}`}
              />
            </button>
            {settlementVisible && (
              <div id="settlement-submenu">
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
              onClick={() => setPaymentOpen((value) => !value)}
              className={[
                "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300",
                itemLayout,
              ].join(" ")}
            >
              <CreditCard size={19} className="shrink-0" />
              <span className={labelClass}>Payment</span>
              <ChevronDown
                size={15}
                className={`${labelClass} ml-auto transition-transform ${paymentVisible ? "rotate-180" : ""}`}
              />
            </button>
            {paymentVisible && (
              <div id="payment-submenu">
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
              onClick={() => setQualityControlOpen((value) => !value)}
              className={["flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300", itemLayout].join(" ")}>
              <ShieldCheck size={19} className="shrink-0" />
              <span className={labelClass}>Quality Control</span>
              <ChevronDown size={15} className={`${labelClass} ml-auto transition-transform ${qualityControlVisible ? "rotate-180" : ""}`} />
            </button>
            {qualityControlVisible && <div id="quality-control-submenu">
              <SidebarChild href="/dashboard/quality-control/sla-cut-off" label="SLA Cut Off"
                active={pathname.startsWith("/dashboard/quality-control/sla-cut-off")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<ShieldCheck size={17}/>} />
              <SidebarChild href="/dashboard/quality-control/waybill-stuck-delivery" label="Waybill Stuck Delivery"
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
              onClick={() => setFinanceOpen((value) => !value)}
              className={["flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-300", itemLayout].join(" ")}>
              <UsersRound size={19} className="shrink-0" />
              <span className={labelClass}>Finance & HR</span>
              <ChevronDown size={15} className={`${labelClass} ml-auto transition-transform ${financeVisible ? "rotate-180" : ""}`} />
            </button>
            {financeVisible && <div id="finance-submenu">
              <SidebarChild href="/dashboard/finance/rincian-operasional" label="Rincian Operasional"
                active={pathname.startsWith("/dashboard/finance/rincian-operasional")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<ReceiptText size={17}/>} />
              <SidebarChild href="/dashboard/finance/cashflow-jfs" label="Cashflow JFS"
                active={pathname.startsWith("/dashboard/finance/cashflow-jfs")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<WalletCards size={17}/>} />
              <SidebarChild href="/dashboard/finance/create-invoice" label="Create Invoice"
                active={pathname.startsWith("/dashboard/finance/create-invoice")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<FileCheck2 size={17}/>} />
              <SidebarChild href="/dashboard/finance/salary-setting" label="Salary Setting"
                active={pathname.startsWith("/dashboard/finance/salary-setting")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<Settings size={17}/>} />
              <SidebarChild href="/dashboard/finance/salary-closing" label="Salary Closing"
                active={pathname.startsWith("/dashboard/finance/salary-closing")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<CalendarDays size={17}/>} />
              <SidebarChild href="/dashboard/finance/salary-recap" label="Salary Recap"
                active={pathname.startsWith("/dashboard/finance/salary-recap")}
                collapsed={collapsed} labelClass={labelClass} layoutClass={childLayout}
                onNavigate={closeMobile} icon={<WalletCards size={17}/>} />
            </div>}
          </div>

          {navigation
            .slice(1)
            .filter(
              (item) => item.label !== "Monitoring" && item.label !== "Payment" && item.label !== "Quality Control" && item.label !== "Finance & HR",
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
          className="border-t border-white/10 p-3"
        >
          <button
            type="submit"
            title={collapsed ? "Logout" : undefined}
            className={[
              "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 outline-none transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-red-300",
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
          className="absolute -right-3 top-24 hidden size-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 lg:grid"
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
          collapsed ? "lg:w-[86px]" : "lg:w-[264px]",
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
        "mt-1 flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-300",
        active
          ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30"
          : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
        layoutClass,
      ].join(" ")}
    >
      <span className="shrink-0">{icon}</span>
      <span className={labelClass}>{label}</span>
    </Link>
  );
}

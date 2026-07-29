"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronLeft,
  CircleGauge,
  CreditCard,
  ChevronDown,
  LogOut,
  Menu,
  PackageCheck,
  ReceiptText,
  Truck,
  Settings,
  ShieldCheck,
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

export function Sidebar({ outletCode }: { outletCode: string | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Buka navigasi"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm lg:hidden"
      >
        <Menu size={20} />
      </button>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/45 lg:hidden"
          aria-label="Tutup navigasi"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-[#0b1739] text-white transition-all duration-300",
          collapsed ? "lg:w-[86px]" : "lg:w-[264px]",
          mobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-20 items-center border-b border-white/10 px-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500 font-black tracking-tight">N</div>
          {!collapsed && (
            <div className="ml-3 min-w-0">
              <div className="font-extrabold tracking-[0.16em]">NEXTGEN</div>
              <div className="text-[11px] text-blue-200">Operations System</div>
            </div>
          )}
          <button aria-label="Tutup navigasi" onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden">
            <X size={20} />
          </button>
        </div>

        {!collapsed && (
          <div className="mx-4 mt-5 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Outlet aktif</p>
            <p className="mt-1 text-sm font-semibold">{outletCode ?? "Semua Outlet"}</p>
          </div>
        )}

        <nav className="mt-5 flex-1 space-y-1 px-3" aria-label="Navigasi utama">
          {navigation.slice(0, 1).map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === item.href
                : item.href.startsWith("/") && pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={[
                  "flex h-11 items-center rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                  collapsed ? "justify-center" : "gap-3",
                ].join(" ")}
              >
                <item.icon size={19} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
          <div className="pt-1">
            <div className={["flex h-11 items-center rounded-xl px-3 text-sm font-medium text-slate-300", collapsed ? "justify-center" : "gap-3"].join(" ")}>
              <WalletCards size={19} />
              {!collapsed && (
                <>
                  <span>Settlement Center</span>
                  <ChevronDown size={15} className="ml-auto" />
                </>
              )}
            </div>
            <Link
              href="/dashboard/settlement/pickup"
              title={collapsed ? "Pickup Settlement" : undefined}
              className={[
                "mt-1 flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
                pathname.startsWith("/dashboard/settlement/pickup")
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30"
                  : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                collapsed ? "justify-center px-3" : "ml-5 gap-3 px-3",
              ].join(" ")}
            >
              <PackageCheck size={17} />
              {!collapsed && <span>Pickup Settlement</span>}
            </Link>
            <Link
              href="/dashboard/settlement/delivery"
              title={collapsed ? "Delivery Settlement" : undefined}
              className={[
                "mt-1 flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
                pathname.startsWith("/dashboard/settlement/delivery")
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30"
                  : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                collapsed ? "justify-center px-3" : "ml-5 gap-3 px-3",
              ].join(" ")}
            >
              <Truck size={17} />
              {!collapsed && <span>Delivery Settlement</span>}
            </Link>
            <Link
              href="/dashboard/settlement/operational"
              title={collapsed ? "Operational Settlement" : undefined}
              className={[
                "mt-1 flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
                pathname.startsWith("/dashboard/settlement/operational")
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30"
                  : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                collapsed ? "justify-center px-3" : "ml-5 gap-3 px-3",
              ].join(" ")}
            >
              <ReceiptText size={17} />
              {!collapsed && <span>Operational Settlement</span>}
            </Link>
          </div>
          <div className="pt-1">
            <div className={["flex h-11 items-center rounded-xl px-3 text-sm font-medium text-slate-300", collapsed ? "justify-center" : "gap-3"].join(" ")}>
              <CreditCard size={19} />
              {!collapsed && <><span>Payment</span><ChevronDown size={15} className="ml-auto" /></>}
            </div>
            <Link href="/dashboard/payment/settlement" title={collapsed ? "Payment Settlement" : undefined} className={[
              "mt-1 flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
              pathname.startsWith("/dashboard/payment/settlement") ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
              collapsed ? "justify-center px-3" : "ml-5 gap-3 px-3",
            ].join(" ")}><WalletCards size={17} />{!collapsed && <span>Payment Settlement</span>}</Link>
            <Link href="/dashboard/payment/pickup" title={collapsed ? "Pickup Payment" : undefined} className={[
              "mt-1 flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
              pathname.startsWith("/dashboard/payment/pickup") ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
              collapsed ? "justify-center px-3" : "ml-5 gap-3 px-3",
            ].join(" ")}><PackageCheck size={17} />{!collapsed && <span>Pickup Payment</span>}</Link>
            <Link href="/dashboard/payment/cash-flow" title={collapsed ? "Cash Flow Payment" : undefined} className={[
              "mt-1 flex h-10 items-center rounded-xl text-sm font-medium transition-colors",
              pathname.startsWith("/dashboard/payment/cash-flow") ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
              collapsed ? "justify-center px-3" : "ml-5 gap-3 px-3",
            ].join(" ")}><ReceiptText size={17} />{!collapsed && <span>Cash Flow Payment</span>}</Link>
          </div>
          {navigation.slice(1).filter((item) => item.label !== "Payment").map((item) => {
            const active = item.href.startsWith("/") && pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={[
                  "flex h-11 items-center rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
                  collapsed ? "justify-center" : "gap-3",
                ].join(" ")}
              >
                <item.icon size={19} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <form action="/api/auth/logout" method="post" className="border-t border-white/10 p-3">
          <button className={["flex h-11 w-full items-center rounded-xl px-3 text-sm font-medium text-slate-300 hover:bg-red-500/10 hover:text-red-200", collapsed ? "justify-center" : "gap-3"].join(" ")}>
            <LogOut size={19} />
            {!collapsed && "Logout"}
          </button>
        </form>
        <button
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          onClick={() => setCollapsed((value) => !value)}
          className="absolute -right-3 top-24 hidden size-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md lg:grid"
        >
          <ChevronLeft size={15} className={collapsed ? "rotate-180" : ""} />
        </button>
      </aside>
      <div className={collapsed ? "hidden lg:block lg:w-[86px]" : "hidden lg:block lg:w-[264px]"} />
    </>
  );
}

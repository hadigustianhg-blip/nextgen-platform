"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ClipboardList, Home, PackageCheck, UserRound } from "lucide-react";
import { TeamPwaInstall } from "@/components/pwa/team-pwa-install";
import { TeamServiceWorkerRegistration } from "@/components/pwa/team-service-worker-registration";

const navigation = [
  { href: "/team", label: "Home", icon: Home },
  { href: "/team/attendance", label: "Absensi", icon: ClipboardList },
  { href: "/team/leave", label: "Pengajuan", icon: CalendarPlus },
  { href: "/team/delivery", label: "Delivery", icon: PackageCheck },
  { href: "/team/profile", label: "Profil", icon: UserRound },
] as const;

export function isTeamNavActive(pathname: string, href: string) {
  return href === "/team" ? pathname === href : pathname.startsWith(href);
}

export function TeamShell({ children, employeeName, outletCode, greeting }: {
  children: React.ReactNode;
  employeeName: string;
  outletCode: string;
  greeting: string;
}) {
  const pathname = usePathname();

  return (
    <div className="team-pwa min-h-dvh overflow-x-hidden bg-[#f4f7fb] text-slate-950">
      <TeamServiceWorkerRegistration />
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 pt-[env(safe-area-inset-top)] shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link href="/team" aria-label="Dashboard Team" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-600 shadow-[0_8px_22px_rgba(37,99,235,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <Image src="/brand/nextgen-mark.svg" alt="NEXTGEN" width={28} height={28} className="size-7 brightness-0 invert" priority />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-500">{greeting}</p>
            <p className="truncate text-sm font-extrabold text-slate-950">{employeeName}</p>
            <p className="truncate text-[11px] font-semibold text-blue-700">Outlet {outletCode}</p>
          </div>
          <Link href="/team/profile" aria-label="Buka profil" className="grid size-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <UserRound size={21} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-7">
        {children}
      </main>

      <nav aria-label="Navigasi Team" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/96 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-5 px-1.5 pt-1.5 sm:px-5">
          {navigation.map((item) => {
            const active = isTeamNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition active:scale-95 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}>
                <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-blue-600" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </nav>
      <TeamPwaInstall />
    </div>
  );
}

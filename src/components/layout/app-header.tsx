"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  LogOut,
  Search,
  Store,
  UserRound,
} from "lucide-react";
import { UserAvatar } from "@/components/ui";
import type { SessionContext } from "@/lib/auth/session";
import {
  filterNavigationItems,
  getSearchableNavigation,
  moveNavigationIndex,
} from "./app-navigation";

type HeaderSession = Pick<
  SessionContext,
  "userName" | "roles" | "outletCode" | "tenantName"
>;

type PendingNotificationItem = {
  id: string;
  employeeName: string;
  type: string;
  startDate: string;
};

function displayRole(roles: readonly string[]) {
  const role = roles[0] ?? "User";
  return role
    .replaceAll("_", " ")
    .toLocaleLowerCase("id-ID")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("id-ID"));
}

export function AppHeader({ session }: { session: HeaderSession }) {
  const router = useRouter();
  const headerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState<PendingNotificationItem[]>([]);

  useEffect(() => {
    const closeFloatingPanels = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
        setNotificationOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeFloatingPanels);
    return () => document.removeEventListener("pointerdown", closeFloatingPanels);
  }, []);

  useEffect(() => {
    fetch("/api/hr/leave?status=PENDING&pageSize=5", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.success && Array.isArray(body.data)) {
          setPendingNotifications(
            body.data.map(
              (row: { id: string; employeeName: string; type: string; startDate: string }) => ({
                id: row.id,
                employeeName: row.employeeName,
                type: row.type,
                startDate: row.startDate,
              }),
            ),
          );
        }
      })
      .catch(() => {
        // Soft fail
      });
  }, []);

  const navigation = useMemo(
    () => getSearchableNavigation(session.roles),
    [session.roles],
  );
  const results = useMemo(
    () => filterNavigationItems(navigation, query),
    [navigation, query],
  );
  const outletCode = session.outletCode || "Outlet belum dipilih";

  const closeSearch = () => {
    setSearchOpen(false);
    setActiveIndex(-1);
  };

  const navigateTo = (href: string) => {
    setQuery("");
    closeSearch();
    router.push(href);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      searchInputRef.current?.blur();
      return;
    }

    if (!searchOpen || results.length === 0) {
      if (event.key === "ArrowDown") {
        setSearchOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => moveNavigationIndex(current, 1, results.length));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => moveNavigationIndex(current, -1, results.length));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      navigateTo(results[activeIndex].href);
    }
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-20 flex min-h-[72px] w-full items-center border-b border-[var(--nextgen-border)] bg-[var(--nextgen-card)]/95 px-4 shadow-[0_1px_0_rgba(15,23,42,0.02),0_8px_30px_rgba(15,23,42,0.025)] backdrop-blur-xl md:px-6 lg:rounded-tl-[var(--nextgen-radius-workspace)] lg:px-7"
    >
      <div className="flex w-full items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1 md:max-w-xl lg:max-w-[500px]">
          <div className="group relative flex items-center">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 text-[var(--nextgen-text-secondary)] transition-colors group-focus-within:text-[var(--nextgen-primary)]"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="search"
              role="combobox"
              aria-expanded={searchOpen && results.length > 0}
              aria-autocomplete="list"
              aria-controls="header-search-results"
              placeholder="Cari fitur (cth: Kas Masuk, Rekap Gaji, Attendance)..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              className="h-10 w-full rounded-[var(--nextgen-radius-control)] border border-slate-200 bg-slate-50/80 pl-10 pr-14 text-xs font-medium text-[var(--nextgen-text-primary)] shadow-inner shadow-slate-950/[0.015] placeholder-[var(--nextgen-text-secondary)] outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/[0.07]"
            />
            <span className="pointer-events-none absolute right-3 hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-400 shadow-sm sm:block">MENU</span>
          </div>

          {searchOpen && (
            <div
              id="header-search-results"
              role="listbox"
              aria-label="Hasil pencarian menu"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-y-auto rounded-[var(--nextgen-radius-inner)] border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] p-1.5 shadow-[0_16px_38px_rgba(15,23,42,0.14)]"
            >
              {results.length > 0 ? (
                results.map((item, index) => {
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={item.href}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => navigateTo(item.href)}
                      onMouseEnter={() => setActiveIndex(index)}
                        className={`flex w-full items-center justify-between rounded-[var(--nextgen-radius-compact)] px-3 py-2.5 text-left text-xs font-medium outline-none transition ${
                        isActive
                          ? "bg-blue-50 text-[var(--nextgen-primary)]"
                          : "text-[var(--nextgen-text-primary)] hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="text-[11px] text-[var(--nextgen-text-secondary)]">{item.section}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-4 text-center text-xs font-medium text-[var(--nextgen-text-secondary)]">
                  Fitur tidak ditemukan.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
          <div
            className="flex h-10 items-center gap-2.5 rounded-[var(--nextgen-radius-control)] border border-blue-100 bg-blue-50/65 px-3 text-xs shadow-sm shadow-blue-950/[0.02]"
            title="Outlet aktif bersifat read-only"
          >
            <span className="grid size-6 place-items-center rounded-lg bg-white text-[var(--nextgen-primary)] shadow-sm ring-1 ring-blue-100"><Store size={13} aria-hidden="true" /></span>
            <div className="min-w-0 leading-tight">
              <span className="block text-[10px] font-medium text-[var(--nextgen-text-secondary)]">Outlet Aktif</span>
              <span className="block max-w-28 truncate font-semibold text-[var(--nextgen-text-primary)] sm:max-w-36 md:max-w-44">
                {outletCode}
              </span>
            </div>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Notifikasi"
              aria-haspopup="dialog"
              aria-expanded={notificationOpen}
              onClick={() => {
                setNotificationOpen((current) => !current);
                setProfileOpen(false);
                closeSearch();
              }}
              className="relative grid size-10 place-items-center rounded-[var(--nextgen-radius-control)] border border-[var(--nextgen-border)] bg-white text-[var(--nextgen-text-secondary)] shadow-sm shadow-slate-950/[0.025] outline-none transition hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50/60 hover:text-[var(--nextgen-primary)] focus-visible:ring-2 focus-visible:ring-blue-300 motion-reduce:transform-none"
            >
              <Bell size={18} aria-hidden="true" />
              {pendingNotifications.length > 0 && (
                <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-red-600 text-[9px] font-extrabold text-white">
                  {pendingNotifications.length}
                </span>
              )}
            </button>
            {notificationOpen && (
              <div
                role="dialog"
                aria-label="Notifikasi"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-[var(--nextgen-radius-inner)] border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] p-3 shadow-[0_16px_38px_rgba(15,23,42,0.14)]"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <p className="text-xs font-semibold text-[var(--nextgen-text-primary)]">Notifikasi</p>
                  {pendingNotifications.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                      {pendingNotifications.length} Pending
                    </span>
                  )}
                </div>

                {pendingNotifications.length === 0 ? (
                  <p className="mt-2.5 text-xs text-[var(--nextgen-text-secondary)]">Belum ada notifikasi.</p>
                ) : (
                  <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                    {pendingNotifications.map((item) => (
                      <Link
                        key={item.id}
                        href="/dashboard/hr/attendance?tab=approval"
                        onClick={() => setNotificationOpen(false)}
                        className="block rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs transition hover:bg-blue-50"
                      >
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span className="truncate">{item.employeeName}</span>
                          <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[9px] text-amber-900 font-extrabold">
                            {item.type === "PERMISSION" ? "Izin" : item.type === "SICK" ? "Sakit" : "Cuti"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500 font-medium">
                          Mengajukan {item.type === "PERMISSION" ? "Izin" : item.type === "SICK" ? "Sakit" : "Cuti"} · Menunggu approval
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Buka menu profil"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((current) => !current);
                setNotificationOpen(false);
                closeSearch();
              }}
              className="flex h-11 items-center gap-2.5 rounded-[var(--nextgen-radius-control)] border border-transparent px-1 outline-none transition hover:border-[var(--nextgen-border)] hover:bg-slate-50/80 focus-visible:ring-2 focus-visible:ring-blue-300 lg:pl-1 lg:pr-2"
            >
              <UserAvatar name={session.userName} className="size-9 rounded-[10px] ring-2 ring-white shadow-sm" />
              <span className="hidden max-w-36 min-w-0 text-left lg:block">
                <span className="block truncate text-xs font-semibold leading-4 text-[var(--nextgen-text-primary)]">
                  {session.userName}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-4 text-[var(--nextgen-text-secondary)]">
                  {displayRole(session.roles)}
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`hidden text-[var(--nextgen-text-secondary)] transition-transform lg:block ${profileOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {profileOpen && (
              <div
                role="menu"
                aria-label="Menu profil"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-[var(--nextgen-radius-inner)] border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] p-1.5 shadow-[0_16px_38px_rgba(15,23,42,0.14)]"
              >
                <div className="border-b border-[var(--nextgen-border)] px-3 py-2.5 lg:hidden">
                  <p className="truncate text-sm font-semibold text-[var(--nextgen-text-primary)]">
                    {session.userName}
                  </p>
                  <p className="truncate text-xs text-[var(--nextgen-text-secondary)]">
                    {displayRole(session.roles)}
                  </p>
                </div>
                <div className="border-b border-[var(--nextgen-border)] px-3 py-2.5">
                  <p className="truncate text-xs font-semibold text-[var(--nextgen-text-primary)]">
                    {session.tenantName || "Tenant"}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--nextgen-text-secondary)]">{outletCode}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push("/dashboard/profile");
                  }}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  <UserRound size={17} aria-hidden="true" />
                  <span className="flex-1">Profil Saya</span>
                </button>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-red-600 outline-none transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-300"
                  >
                    <LogOut size={17} aria-hidden="true" />
                    Logout
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

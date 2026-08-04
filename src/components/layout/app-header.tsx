"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  "userName" | "roles" | "outletCode"
>;

function displayRole(roles: readonly string[]) {
  const role = roles[0] ?? "User";
  return role.replaceAll("_", " ").toLocaleLowerCase("id-ID")
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
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSearchOpen(results.length > 0);
      setActiveIndex((current) => moveNavigationIndex(
        current,
        event.key === "ArrowDown" ? 1 : -1,
        results.length,
      ));
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
      className="sticky top-0 z-20 flex min-h-[72px] items-center border-b border-[var(--nextgen-border)] bg-[var(--nextgen-card)] px-4 pl-16 shadow-[0_1px_8px_rgba(15,23,42,0.035)] sm:px-5 sm:pl-20 lg:px-8"
    >
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2.5 sm:gap-3 lg:gap-4">
        <div className="relative min-w-0 flex-1 md:max-w-xl">
          <label htmlFor="global-menu-search" className="sr-only">
            Cari menu, laporan, atau data
          </label>
          <Search
            aria-hidden="true"
            size={19}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nextgen-text-secondary)]"
          />
          <input
            ref={searchInputRef}
            id="global-menu-search"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen && results.length > 0}
            aria-controls="global-menu-search-results"
            aria-activedescendant={activeIndex >= 0 ? `global-menu-result-${activeIndex}` : undefined}
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setActiveIndex(-1);
              setSearchOpen(value.trim().length > 0);
            }}
            onFocus={() => setSearchOpen(query.trim().length > 0)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Cari menu, laporan, atau data…"
            className="h-11 w-full min-w-0 rounded-[13px] border border-[var(--nextgen-border)] bg-[var(--nextgen-background)] pl-10 pr-3 text-sm text-[var(--nextgen-text-primary)] outline-none transition placeholder:text-transparent hover:border-slate-300 focus:border-[var(--nextgen-primary)] focus:bg-white focus:ring-4 focus:ring-blue-500/10 sm:placeholder:text-[var(--nextgen-text-secondary)]"
          />
          {searchOpen && query.trim() && (
            <div
              id="global-menu-search-results"
              role="listbox"
              aria-label="Hasil pencarian menu"
              className="absolute left-0 top-[calc(100%+8px)] max-h-80 w-[calc(100vw-5rem)] overflow-y-auto rounded-[13px] border border-[var(--nextgen-border)] bg-white p-1.5 shadow-[0_16px_38px_rgba(15,23,42,0.14)] sm:right-0 sm:w-auto"
            >
              {results.length > 0 ? results.map((item, index) => (
                <button
                  key={item.href}
                  id={`global-menu-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => navigateTo(item.href)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left outline-none transition ${
                    activeIndex === index
                      ? "bg-[var(--nextgen-primary-soft)] text-[var(--nextgen-primary)]"
                      : "text-[var(--nextgen-text-primary)] hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate text-sm font-semibold">{item.label}</span>
                  <span className="shrink-0 text-[11px] text-[var(--nextgen-text-secondary)]">
                    {item.section}
                  </span>
                </button>
              )) : (
                <p className="px-3 py-5 text-center text-sm text-[var(--nextgen-text-secondary)]">
                  Menu tidak ditemukan.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
          <div
            aria-label={`Outlet Aktif: ${outletCode}`}
            className="flex h-11 shrink-0 items-center gap-2 rounded-[13px] border border-[var(--nextgen-border)] bg-white px-2.5 sm:px-3"
            title="Outlet aktif bersifat read-only"
          >
            <Store size={18} className="shrink-0 text-[var(--nextgen-primary)]" aria-hidden="true" />
            <span className="hidden min-w-0 md:block">
              <span className="block text-[10px] font-medium leading-3 text-[var(--nextgen-text-secondary)]">Outlet Aktif</span>
              <span className="block max-w-24 truncate text-xs font-semibold leading-4 text-[var(--nextgen-text-primary)]">{outletCode}</span>
            </span>
            <span className="max-w-16 truncate text-xs font-semibold text-[var(--nextgen-text-primary)] md:hidden">{outletCode}</span>
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
              className="grid size-11 place-items-center rounded-[13px] border border-[var(--nextgen-border)] bg-white text-[var(--nextgen-text-secondary)] outline-none transition hover:bg-slate-50 hover:text-[var(--nextgen-primary)] focus-visible:ring-4 focus-visible:ring-blue-500/10"
            >
              <Bell size={19} aria-hidden="true" />
            </button>
            {notificationOpen && (
              <div
                role="dialog"
                aria-label="Notifikasi"
                className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-[13px] border border-[var(--nextgen-border)] bg-white p-4 shadow-[0_16px_38px_rgba(15,23,42,0.14)]"
              >
                <p className="text-sm font-semibold text-[var(--nextgen-text-primary)]">Notifikasi</p>
                <p className="mt-1 text-sm text-[var(--nextgen-text-secondary)]">Belum ada notifikasi.</p>
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
              className="flex h-11 items-center gap-2 rounded-[13px] outline-none transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-blue-500/10 lg:px-1.5"
            >
              <UserAvatar name={session.userName} className="size-10 rounded-xl" />
              <span className="hidden max-w-36 min-w-0 text-left lg:block">
                <span className="block truncate text-sm font-semibold leading-4 text-[var(--nextgen-text-primary)]">{session.userName}</span>
                <span className="mt-0.5 block truncate text-[11px] leading-4 text-[var(--nextgen-text-secondary)]">{displayRole(session.roles)}</span>
              </span>
              <ChevronDown size={16} className="hidden text-[var(--nextgen-text-secondary)] lg:block" aria-hidden="true" />
            </button>
            {profileOpen && (
              <div
                role="menu"
                aria-label="Menu profil"
                className="absolute right-0 top-[calc(100%+8px)] w-60 rounded-[13px] border border-[var(--nextgen-border)] bg-white p-1.5 shadow-[0_16px_38px_rgba(15,23,42,0.14)]"
              >
                <div className="border-b border-[var(--nextgen-border)] px-3 py-2.5 lg:hidden">
                  <p className="truncate text-sm font-semibold text-[var(--nextgen-text-primary)]">{session.userName}</p>
                  <p className="truncate text-xs text-[var(--nextgen-text-secondary)]">{displayRole(session.roles)}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  title="Segera tersedia"
                  className="mt-1 flex w-full cursor-not-allowed items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm text-slate-400"
                >
                  <UserRound size={17} aria-hidden="true" />
                  <span className="flex-1">Profil Saya</span>
                  <span className="text-[10px]">Segera tersedia</span>
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

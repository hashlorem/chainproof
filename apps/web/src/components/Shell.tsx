"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Loading, cx } from "./ui";

const NAV = [
  { href: "/", label: "Cases" },
  { href: "/analyze", label: "Check a photo" },
  { href: "/devices", label: "Devices" },
  { href: "/verify", label: "Public verify" },
];

export function Logo() {
  return (
    <Link href="/" className="heading flex items-center gap-2.5 text-[22px]">
      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="2" y="7" width="9" height="10" />
        <rect x="13" y="7" width="9" height="10" />
        <path d="M11 12h2" />
      </svg>
      ChainProof
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <Loading />;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-[1000] border-b-2 border-rule bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-stretch px-4">
          <div className="flex items-center border-r border-rule py-3 pr-5">
            <Logo />
          </div>
          <nav className="flex flex-wrap items-stretch text-xs uppercase tracking-[0.08em]">
            {[...NAV, ...(user.role === "supervisor" ? [{ href: "/users", label: "Users" }] : [])].map((n) => {
              const active = n.href === "/" ? path === "/" || path.startsWith("/cases") || path.startsWith("/evidence") : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex min-h-11 items-center border-r border-rule px-4", active ? "bg-accent text-accent-ink" : "hover:bg-surface-2")}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-4 py-2 pl-4 text-xs">
            <Link href="/account" className="hover:underline" title="Change password">
              {user.name} · <span className="uppercase tracking-[0.08em]">{user.role}</span>
            </Link>
            <button onClick={() => { logout(); router.replace("/login"); }} className="uppercase tracking-[0.08em] hover:underline">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

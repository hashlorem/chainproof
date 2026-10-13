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
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="2" y="8" width="9" height="8" rx="4" />
        <rect x="13" y="8" width="9" height="8" rx="4" />
        <path d="M9 12h6" />
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
      <header className="sticky top-0 z-[1000] border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Logo />
          <nav className="flex flex-wrap gap-1 text-sm">
            {[...NAV, ...(user.role === "supervisor" ? [{ href: "/users", label: "Users" }] : [])].map((n) => {
              const active = n.href === "/" ? path === "/" || path.startsWith("/cases") || path.startsWith("/evidence") : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={cx("rounded-md px-2.5 py-1.5", active ? "bg-surface-2 font-medium" : "text-muted hover:text-ink")}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/account" className="text-muted hover:text-ink" title="Change password">
              {user.name} · <span className="capitalize">{user.role}</span>
            </Link>
            <button onClick={() => { logout(); router.replace("/login"); }} className="text-muted hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

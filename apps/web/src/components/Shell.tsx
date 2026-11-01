"use client";

import { verifyChain } from "@chainproof/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api, formatTs, type CustodyResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loading, cx } from "./ui";

const NAV = [
  {
    title: "Work", items: [
      { href: "/", label: "Cases", icon: "M4 6h16M4 12h16M4 18h10" },
      { href: "/analyze", label: "Check a photo", icon: "M4 7h3l2-2h6l2 2h3v12H4z M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6" },
    ],
  },
  {
    title: "Lab", items: [
      { href: "/devices", label: "Devices", icon: "M8 3h8v18H8z M11 18h2" },
      { href: "/users", label: "Users", icon: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 20c0-3 3-5 6-5s6 2 6 5 M17 11a2.5 2.5 0 1 0 0-5 M21 19c0-2-1.5-3.5-3.5-4", supervisor: true },
      { href: "/verify", label: "Public verify", icon: "M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-5" },
    ],
  },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-[18px] text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <path d="M10 6.5h4.5V14" />
      </svg>
      ChainProof
    </Link>
  );
}

/** The case a page is showing, so the status bar can re-check its custody chain. */
const CaseContext = createContext<(caseId: string | null) => void>(() => {});
export function useStatusCase(caseId: string | null | undefined) {
  const set = useContext(CaseContext);
  useEffect(() => {
    set(caseId ?? null);
    return () => set(null);
  }, [caseId, set]);
}

// The theme lives on <html data-theme>, set before first paint by the script in app/layout.tsx.
type Theme = "dark" | "light";
const THEME_KEY = "chainproof-theme";
const themeListeners = new Set<() => void>();
function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore<Theme>(
    (cb) => { themeListeners.add(cb); return () => { themeListeners.delete(cb); }; },
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* not remembered, still switches */ }
    themeListeners.forEach((cb) => cb());
  };
  return [theme, toggle];
}

// One shared one-second tick for the UTC clock; the server renders no time, so nothing mismatches on hydration.
function useUtcClock(): string {
  return useSyncExternalStore(
    (cb) => { const t = setInterval(cb, 1000); return () => clearInterval(t); },
    () => new Date().toISOString().slice(0, 19).replace("T", " "),
    () => "",
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [caseId, setCaseId] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <Loading />;

  const active = (href: string) =>
    href === "/" ? path === "/" || path.startsWith("/cases") || path.startsWith("/evidence") : path.startsWith(href);

  return (
    <CaseContext.Provider value={setCaseId}>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-[1000] flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2">
          <Logo />
          <div className="flex-1" />
          <button type="button" onClick={toggleTheme} className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-ink"
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Switch theme">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {theme === "dark" ? <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></>}
            </svg>
          </button>
          <Link href="/account" className="rounded-md px-2.5 py-1.5 hover:bg-surface-2" title="Account and password">
            {user.name} <span className="text-muted">· {user.role}</span>
          </Link>
          <button type="button" onClick={() => { logout(); router.replace("/login"); }} className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-ink">
            Sign out
          </button>
        </header>

        <div className="flex flex-1 flex-wrap">
          <nav aria-label="Main" className="flex w-full flex-wrap gap-x-4 gap-y-3 bg-surface px-3 py-3 sm:w-52 sm:flex-col sm:flex-nowrap sm:gap-5 sm:py-4">
            {NAV.map((group) => (
              <div key={group.title} className="flex flex-wrap gap-1 sm:flex-col">
                <div className="eyebrow hidden px-2.5 pb-1 sm:block">{group.title}</div>
                {group.items.filter((n) => !n.supervisor || user.role === "supervisor").map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active(n.href) ? "page" : undefined}
                    className={cx("flex items-center gap-2.5 rounded-md px-2.5 py-1.5", active(n.href) ? "bg-accent/25 text-ink" : "text-ink/85 hover:bg-surface-2")}
                  >
                    <svg viewBox="0 0 24 24" className={cx("size-4", active(n.href) ? "text-accent" : "text-muted")} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d={n.icon} />
                    </svg>
                    {n.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <main className="min-w-0 flex-[999_1_560px] px-4 py-6 sm:px-8">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>
        </div>

        <StatusBar caseId={caseId} />
      </div>
    </CaseContext.Provider>
  );
}

type Meta = { commit: string; validated_at: string | null; validation_images: number | null };

/**
 * Always visible, like the status line of lab software: the open case's chain re-checked in this browser (hashes and
 * server signatures, no server call that adds an entry), its latest trusted-timestamp anchor, the build, the validation
 * the error rates come from, and a UTC clock.
 */
function StatusBar({ caseId }: { caseId: string | null }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [chain, setChain] = useState<{ caseId: string; ok: boolean; text: string; anchor: string | null } | null>(null);
  const now = useUtcClock();

  useEffect(() => {
    api.get<Meta>("/meta").then(setMeta, () => setMeta(null));
  }, []);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    const check = () =>
      api.get<CustodyResponse>(`/cases/${caseId}/custody`).then((c) => {
        if (cancelled) return;
        const r = verifyChain(c.entries, c.server_public_key_hex);
        const last = [...c.entries].reverse().find((e) => e.action === "ANCHORED");
        const d = last?.details as { head_seq?: number; tsa_time?: string } | undefined;
        setChain({
          caseId,
          ok: r.ok,
          text: r.ok ? `Chain intact · ${r.length} of ${r.length} signed` : `Chain broken at #${r.brokenAt}: ${r.reason}`,
          anchor: d?.head_seq ? `Anchored up to #${d.head_seq} · FreeTSA ${formatTs(d.tsa_time)}` : "Not anchored yet: press Verify",
        });
      }, () => {});
    check();
    const t = setInterval(check, 15000);  // picks up entries added by this page's own actions
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [caseId]);

  const shown = caseId && chain?.caseId === caseId ? chain : null;
  return (
    <footer aria-label="Status" className="z-[1000] sm:sticky sm:bottom-0 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-surface px-4 py-1.5 text-xs text-muted">
      {shown ? (
        <>
          <span className={cx("flex items-center gap-1.5 font-medium", shown.ok ? "text-ok" : "text-bad")}>
            <span className={cx("size-1.5 rounded-full", shown.ok ? "bg-ok" : "bg-bad")} aria-hidden />
            {shown.text}
          </span>
          <span>{shown.anchor}</span>
        </>
      ) : (
        <span>Open a case to see its chain of custody here.</span>
      )}
      {meta?.validated_at && <span>Error rates from validation of {formatTs(meta.validated_at).replace(/, .*/, "")} · {meta.validation_images?.toLocaleString("en")} images</span>}
      <span className="flex-1" />
      {meta && <span className="font-mono">ChainProof {meta.commit.slice(0, 7)}</span>}
      {now && <span className="font-mono text-ink">{now} UTC</span>}
    </footer>
  );
}

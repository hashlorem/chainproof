import Link from "next/link";
import { Logo } from "@/components/Shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // Public verify stays light and plain whatever theme staff use: outsiders checking a PDF need trust, not style.
    <div data-theme="light" className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <Link href="/login" className="text-[13px] text-accent hover:underline">Staff sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

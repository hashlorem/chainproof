import { Logo, StaffLink } from "@/components/Shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // Plain on purpose: no staff menu, one job. It uses the same theme as the app (the saved choice, or dark).
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <StaffLink />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

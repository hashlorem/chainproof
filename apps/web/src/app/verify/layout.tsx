import Link from "next/link";
import { Logo } from "@/components/Shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b-2 border-rule bg-bg">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <Link href="/login" className="text-xs uppercase tracking-[0.08em] hover:underline">Staff sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

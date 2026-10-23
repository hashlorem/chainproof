"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Shell";
import { Button, ErrorBox, inputClass } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const DEMO = [
  ["investigator@chainproof.dev", "Investigator"],
  ["supervisor@chainproof.dev", "Supervisor"],
  ["auditor@chainproof.dev", "Auditor"],
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3 border-b-2 border-rule pb-4">
          <Logo />
          <p className="text-sm text-muted">Tamper-evident evidence: signed on capture, tracked on every touch, checked on demand.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 border-2 border-rule bg-surface p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-bad">Staff sign in</div>
          <label className="block space-y-1 text-sm">
            <span className="eyebrow">Email</span>
            <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="eyebrow">Password</span>
            <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" busy={busy} className="w-full">Sign in</Button>
        </form>
        {process.env.NODE_ENV !== "production" && (
          <div className="space-y-1 text-xs text-muted">
            <p>Demo accounts (password <code>chainproof123</code>):</p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map(([e, label]) => (
                <button key={e} className="min-h-9 border border-rule px-2.5 uppercase tracking-[0.06em] hover:bg-surface-2 hover:text-ink" onClick={() => { setEmail(e); setPassword("chainproof123"); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

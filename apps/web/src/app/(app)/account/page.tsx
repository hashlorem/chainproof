"use client";

import { useState } from "react";
import { Button, Card, ErrorBox, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="heading text-2xl">Your account</h1>
        <p className="text-sm text-muted">{user?.name} · {user?.email} · <span className="capitalize">{user?.role}</span></p>
      </div>
      <Card title="Change password">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setDone(false);
            if (next !== confirm) return setError("The new passwords don't match");
            setBusy(true);
            try {
              await api.post("/auth/password", { current_password: current, new_password: next });
              setDone(true);
              setCurrent(""); setNext(""); setConfirm("");
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input className={inputClass} type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <input className={inputClass} type="password" placeholder="New password (min 8 characters)" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          <input className={inputClass} type="password" placeholder="Repeat new password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {error && <ErrorBox>{error}</ErrorBox>}
          {done && <p className="text-sm text-ok">Password changed.</p>}
          <Button type="submit" busy={busy}>Change password</Button>
        </form>
      </Card>
    </div>
  );
}

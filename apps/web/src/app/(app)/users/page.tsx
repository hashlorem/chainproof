"use client";

import { useState } from "react";
import { Button, Card, ErrorBox, Loading, Pill, inputClass } from "@/components/ui";
import { api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

const ROLE_INFO: Record<Role, string> = {
  investigator: "Opens cases, captures and imports evidence",
  supervisor: "Everything investigators can do, plus users, devices, reopening cases",
  auditor: "Read-only: views, verifies and exports reports",
};

export default function UsersPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<User[]>("/auth/users");

  if (user?.role !== "supervisor") return <ErrorBox>Only supervisors can manage users.</ErrorBox>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted">Every action in a chain of custody is tied to one of these accounts.</p>
      </div>
      <NewUser onCreated={reload} />
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card>
        {loading && !data ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-border">
            {data?.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={u.role === "supervisor" ? "info" : u.role === "auditor" ? "neutral" : "ok"}>{u.role}</Pill>
                  {u.id !== user.id && <ResetPassword u={u} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function NewUser({ onCreated }: { onCreated: () => void }) {
  const empty = { name: "", email: "", password: "", role: "investigator" as Role };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card title="Add a user">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setDone(null);
          try {
            await api.post("/auth/users", form);
            setDone(`Created ${form.email}. Share the password with them privately.`);
            setForm(empty);
            onCreated();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className={inputClass} placeholder="Full name" value={form.name} onChange={set("name")} required />
        <input className={inputClass} placeholder="Email" type="email" value={form.email} onChange={set("email")} required />
        <input className={inputClass} placeholder="Temporary password (min 8 characters)" type="password" minLength={8} value={form.password} onChange={set("password")} required autoComplete="new-password" />
        <select className={inputClass} value={form.role} onChange={set("role")}>
          {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
            <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}: {ROLE_INFO[r]}</option>
          ))}
        </select>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" busy={busy}>Create user</Button>
          {done && <span className="text-sm text-ok">{done}</span>}
        </div>
        {error && <div className="sm:col-span-2"><ErrorBox>{error}</ErrorBox></div>}
      </form>
    </Card>
  );
}

function ResetPassword({ u }: { u: User }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <Button variant="ghost" onClick={() => { setOpen(true); setMsg(null); }}>Reset password</Button>;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.post(`/auth/users/${u.id}/password`, { new_password: pw });
          setMsg("Done");
          setOpen(false);
          setPw("");
        } catch (err) {
          setMsg(err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <input className={`${inputClass} w-48`} type="password" placeholder="New password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus autoComplete="new-password" />
      <Button type="submit">Save</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </form>
  );
}

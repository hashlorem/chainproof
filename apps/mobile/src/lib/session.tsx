import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadSession, setServerUrl, setToken, type User } from "./api";
import { ensureEnrolled } from "./device";
import { flushQueue } from "./queue";

type Session = {
  user: User | null;
  ready: boolean;
  signIn: (server: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (s.serverUrl && s.hasToken) {
        try {
          const me = await api.get<User>("/auth/me");
          setUser(me);
          flushQueue().catch(() => {});
        } catch (e) {
          // Offline is fine: keep the session so the user can still capture. A rejected token is not.
          if ((e as { status?: number }).status === 401) await setToken(null);
          else setUser({ id: "", email: "", name: "Offline", role: "investigator" });
        }
      }
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (server: string, email: string, password: string) => {
    await setServerUrl(server);
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email: email.trim().toLowerCase(), password });
    await setToken(res.token);
    if (res.user.role === "auditor") {
      await setToken(null);
      throw new Error("Auditors use the web app. The phone app is for capturing evidence.");
    }
    await ensureEnrolled(res.user.id);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

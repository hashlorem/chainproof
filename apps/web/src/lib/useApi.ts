"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type State<T> = { key: string; data: T | null; error: string | null };

/** Small fetch hook: data, error, loading and a reload() for after mutations. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ key: "", data: null, error: null });
  const key = String(path);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api.get<T>(path).then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (e) => !cancelled && setState((s) => ({ key, data: s.data, error: e instanceof Error ? e.message : String(e) })),
    );
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  // Keeps showing the current data while it refreshes, then swaps it in.
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const data = await api.get<T>(path);
      setState({ key: String(path), data, error: null });
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [path]);

  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), []);

  return { data: state.data, error: state.error, loading: !!path && state.key !== key, reload, setData };
}

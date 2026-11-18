import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, getToken, UNAUTHORIZED_EVENT } from "@/lib/api";
import type { User } from "@/types";

interface AuthValue { user: User | null; loading: boolean; login: (token: string, user: User) => void; logout: () => void; updateUser: (user: User) => void }
const AuthContext = createContext<AuthValue>({ user: null, loading: true, login: () => {}, logout: () => {}, updateUser: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken("staff")));
  useEffect(() => {
    if (!getToken("staff")) return;
    apiFetch<User>("/api/auth/me").then(setUser).catch(() => localStorage.removeItem("wellness_staff_token")).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const onUnauthorized = (event: Event) => { if ((event as CustomEvent).detail !== "staff") return; setUser(null); };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);
  const login = (token: string, value: User) => { localStorage.setItem("wellness_staff_token", token); setUser(value); };
  const logout = () => { localStorage.removeItem("wellness_staff_token"); setUser(null); };
  return <AuthContext.Provider value={{ user, loading, login, logout, updateUser: setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

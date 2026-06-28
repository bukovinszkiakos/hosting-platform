"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError, type CurrentUser, type LoginRequest } from "@/services/api";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-derive the current user from the session. Auth state is not stored in the
  // browser; it lives in the HttpOnly session cookie (see docs/03 "Authentication
  // Flow"), so a 401 simply means "not signed in".
  const refresh = useCallback(async () => {
    try {
      setUser(await api.auth.me());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return;
      }
      throw error;
    }
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      await api.auth.login(credentials);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  // Restore the user on first load so authentication persists across reloads.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refresh();
      } catch {
        // Ignore hydration errors (e.g. network); treat as signed out.
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

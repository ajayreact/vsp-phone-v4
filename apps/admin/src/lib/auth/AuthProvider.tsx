'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMe,
  issueRefreshToken,
  loginRequest,
  logoutRequest,
  refreshAccessToken,
} from '../api/auth';
import {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './session';
import type { AuthSession } from '../../types/auth';

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async (token: string) => {
    const me = await fetchMe(token);
    setSession(me);
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    loadSession(token)
      .catch(() => {
        clearSessionTokens();
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, [loadSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    setAccessToken(result.accessToken);
    try {
      const refresh = await issueRefreshToken(result.accessToken);
      setRefreshToken(refresh.refreshToken);
    } catch {
      // Refresh token optional for MVP
    }
    await loadSession(result.accessToken);
  }, [loadSession]);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    const refresh = getRefreshToken();
    if (token) {
      try {
        await logoutRequest(token, refresh ?? undefined);
      } catch {
        // Best-effort logout
      }
    }
    clearSessionTokens();
    setSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const refresh = getRefreshToken();
    if (!refresh) return;
    const result = await refreshAccessToken(refresh);
    setAccessToken(result.accessToken);
    await loadSession(result.accessToken);
  }, [loadSession]);

  const value = useMemo(
    () => ({ session, loading, login, logout, refreshSession }),
    [session, loading, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function usePermissions() {
  const { session } = useAuth();
  return session?.permissions ?? [];
}

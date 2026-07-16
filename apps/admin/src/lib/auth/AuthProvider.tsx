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
  exchangeImpersonationHandoff,
  exitImpersonationRequest,
  fetchMe,
  issueRefreshToken,
  loginRequest,
  logoutRequest,
  refreshAccessToken,
} from '../api/auth';
import { detectPortal } from '../portal/detect-portal';
import {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './session';
import type { AuthPortal, AuthSession } from '../../types/auth';

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  acceptImpersonationHandoff: (code: string) => Promise<void>;
  exitImpersonation: () => Promise<{ handoffCode: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const portal = detectPortal() as AuthPortal;

  const loadSession = useCallback(async (token: string) => {
    const me = await fetchMe(token);
    if (me.portal && me.portal !== portal) {
      clearSessionTokens();
      setSession(null);
      throw new Error(
        `This session belongs to the ${me.portal} portal. Sign in again on this site.`,
      );
    }
    setSession(me);
  }, [portal]);

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

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginRequest(email, password, portal);
      if (result.portal && result.portal !== portal) {
        throw new Error('Portal mismatch after login');
      }
      setAccessToken(result.accessToken);
      try {
        const refresh = await issueRefreshToken(result.accessToken);
        setRefreshToken(refresh.refreshToken);
      } catch {
        // Refresh token optional for MVP
      }
      await loadSession(result.accessToken);
    },
    [loadSession, portal],
  );

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

  const acceptImpersonationHandoff = useCallback(
    async (code: string) => {
      const result = await exchangeImpersonationHandoff(code);
      setAccessToken(result.accessToken);
      try {
        const refresh = await issueRefreshToken(result.accessToken);
        setRefreshToken(refresh.refreshToken);
      } catch {
        /* optional */
      }
      await loadSession(result.accessToken);
    },
    [loadSession],
  );

  const exitImpersonation = useCallback(async () => {
    const token = getAccessToken();
    if (!token) throw new Error('Not signed in');
    const result = await exitImpersonationRequest(token);
    clearSessionTokens();
    setSession(null);
    return { handoffCode: result.handoffCode };
  }, []);

  const value = useMemo(
    () => ({
      session,
      loading,
      login,
      logout,
      refreshSession,
      acceptImpersonationHandoff,
      exitImpersonation,
    }),
    [session, loading, login, logout, refreshSession, acceptImpersonationHandoff, exitImpersonation],
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

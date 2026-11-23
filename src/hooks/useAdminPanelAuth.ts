import { useCallback, useEffect, useRef, useState } from 'react';

export type CredentialSource = 'env' | 'claimed' | 'unconfigured';

export interface AdminPanelAuthState {
  statusLoading: boolean;
  submitting: boolean;
  configured: boolean;
  source: CredentialSource;
  usernameEnvConfigured: boolean;
  authenticated: boolean;
  adminUsername: string | null;
  error: string | null;
  refreshStatus: () => Promise<void>;
  setupAdmin: (username: string, password: string) => Promise<boolean>;
  loginAdmin: (username: string, password: string) => Promise<boolean>;
  loginAdminWithGoogle: (idToken: string) => Promise<boolean>;
  logoutAdmin: () => Promise<void>;
  clearError: () => void;
}

export function useAdminPanelAuth(): AdminPanelAuthState {
  // Strictly in-memory session token (never persisted to localStorage/sessionStorage)
  const tokenRef = useRef<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [source, setSource] = useState<CredentialSource>('unconfigured');
  const [usernameEnvConfigured, setUsernameEnvConfigured] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (tokenRef.current) {
        headers.Authorization = `Bearer ${tokenRef.current}`;
      }
      const res = await fetch('/api/admin/auth/status', {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Não foi possível verificar o status de acesso do painel.');
      }
      const data = (await res.json()) as {
        configured: boolean;
        source: CredentialSource;
        usernameEnvConfigured?: boolean;
        authenticated: boolean;
        username?: string;
      };
      setConfigured(Boolean(data.configured));
      setSource(data.source ?? 'unconfigured');
      setUsernameEnvConfigured(Boolean(data.usernameEnvConfigured));
      setAuthenticated(Boolean(data.authenticated));
      setAdminUsername(data.authenticated && data.username ? data.username : null);
      if (!data.authenticated) {
        tokenRef.current = null;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao conectar com o servidor de autenticação.'
      );
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const setupAdmin = useCallback(async (username: string, password: string): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as {
        token?: string;
        username?: string;
        source?: CredentialSource;
        error?: string;
      };
      if (!res.ok || !data.token) {
        setError(data.error ?? 'Não foi possível salvar o acesso do painel.');
        if (res.status === 409) {
          setConfigured(true);
        }
        return false;
      }
      tokenRef.current = data.token;
      setConfigured(true);
      setSource(data.source ?? 'claimed');
      setAuthenticated(true);
      setAdminUsername(data.username ?? username.trim());
      return true;
    } catch {
      setError('Falha de comunicação com o servidor. Tente novamente.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const loginAdmin = useCallback(async (username: string, password: string): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as {
        token?: string;
        username?: string;
        source?: CredentialSource;
        error?: string;
      };
      if (!res.ok || !data.token) {
        setError(data.error ?? 'Login ou senha inválidos.');
        return false;
      }
      tokenRef.current = data.token;
      setConfigured(true);
      setSource(data.source ?? source);
      setAuthenticated(true);
      setAdminUsername(data.username ?? username.trim());
      return true;
    } catch {
      setError('Falha de comunicação com o servidor. Tente novamente.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [source]);

  const loginAdminWithGoogle = useCallback(
    async (idToken: string): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const data = (await res.json()) as {
          token?: string;
          username?: string;
          source?: CredentialSource;
          error?: string;
        };
        if (!res.ok || !data.token) {
          setError(data.error ?? 'Esta conta Google não tem permissão para acessar o painel.');
          return false;
        }
        tokenRef.current = data.token;
        setConfigured(true);
        setSource(data.source ?? source);
        setAuthenticated(true);
        setAdminUsername(data.username ?? 'Administradora');
        return true;
      } catch {
        setError('Falha de comunicação com o servidor. Tente novamente.');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [source]
  );

  const logoutAdmin = useCallback(async () => {
    const token = tokenRef.current;
    tokenRef.current = null;
    setAuthenticated(false);
    setAdminUsername(null);
    setError(null);
    if (token) {
      try {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Local session already cleared
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    statusLoading,
    submitting,
    configured,
    source,
    usernameEnvConfigured,
    authenticated,
    adminUsername,
    error,
    refreshStatus,
    setupAdmin,
    loginAdmin,
    loginAdminWithGoogle,
    logoutAdmin,
    clearError,
  };
}

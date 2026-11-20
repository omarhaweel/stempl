import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, ApiError } from '@/lib/api';
import { clearToken, getToken, setToken } from '@/lib/token-storage';

export type Role = 'customer' | 'professional' | 'admin' | 'super_admin';

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  role: Role;
  /** Null for system administrators (super admin). */
  companyId: string | null;
  companyName: string | null;
  companyOrgNumber: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on launch.
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const res = await api<{ user: User }>('/auth/me', { token });
          setUser(res.user);
        }
      } catch (e) {
        // Drop the token only if the server rejected it, not on network errors.
        if (e instanceof ApiError && e.status === 401) await clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function finish(res: { token: string; user: User }) {
    await setToken(res.token);
    setUser(res.user);
  }

  const value: AuthState = {
    user,
    loading,
    login: async (email, password) =>
      finish(await api('/auth/login', { body: { email, password } })),
    logout: async () => {
      await clearToken();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

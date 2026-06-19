import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export type Role = 'owner' | 'shop_seller' | 'factory_sender' | 'super_admin' | 'accountant';
export type User = {
  id: number;
  username: string;
  full_name_ar: string;
  role: Role;
  force_password_change?: boolean;
  last_login_at?: string | null;
};

type LoginResult = { forcePasswordChange: boolean };

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ramex_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<User>('/users/me')
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem('ramex_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post<{ token: string; user: User; forcePasswordChange: boolean }>(
      '/auth/login',
      { username, password },
    );
    localStorage.setItem('ramex_token', data.token);
    setUser(data.user);
    return { forcePasswordChange: data.forcePasswordChange ?? false };
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    localStorage.removeItem('ramex_token');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

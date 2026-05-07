import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const Ctx = createContext(true);

export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return <Ctx.Provider value={online}>{children}</Ctx.Provider>;
}

export const useOnline = () => useContext(Ctx);

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
export type MediaRow = { id: string; kind: 'product' | 'slide'; title: string; description: string; image_url: string | null; enabled: boolean; deleted: boolean; cta: 'discover' | 'advisor'; sort_order: number };
const Context = createContext<MediaRow[] | null>(null);
export function StorefrontMediaProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<MediaRow[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const base = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
        if (Platform.OS !== 'web' && !base) return;
        const response = await fetch(`${base}/api/storefront-media`);
        if (!response.ok) return;
        const data = await response.json();
        if (active && Array.isArray(data.media)) setRows(data.media);
      } catch { /* Retain the last confirmed image settings during a network interruption. */ }
    };
    load(); const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <Context.Provider value={rows}>{children}</Context.Provider>;
}
export const useStorefrontMedia = () => useContext(Context);

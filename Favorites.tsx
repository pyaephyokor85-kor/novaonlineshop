import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { novaCatalog } from './data/nova-catalog';
import { parseFavoriteIds } from './lib/storefront-discovery.mjs';
const KEY = '@nova/saved-scents-v1';
const Context = createContext<{ ids: string[]; ready: boolean; error: string; toggle: (id: string) => void }>({ ids: [], ready: false, error: '', toggle: () => {} });
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const current = useRef<string[]>([]);
  const writes = useRef(Promise.resolve());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    AsyncStorage.getItem(KEY).then(value => {
      if (!active.current) return;
      current.current = parseFavoriteIds(value, novaCatalog.map(p => p.id));
      setIds(current.current); setReady(true);
    }).catch(() => { if (active.current) setError('Saved စာရင်းကို ဖတ်မရပါ။ Refresh လုပ်ပြီး ပြန်စမ်းပါ။'); });
    return () => { active.current = false; };
  }, []);
  const toggle = (id: string) => {
    if (!ready || !novaCatalog.some(p => p.id === id)) return;
    const next = current.current.includes(id) ? current.current.filter(value => value !== id) : [...current.current, id];
    current.current = next; setIds(next);
    // Serialize device writes so rapid taps cannot overwrite a newer selection.
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)))
      .then(() => { if (active.current) setError(''); })
      .catch(() => { if (active.current) setError('ဒီစက်မှာ Saved စာရင်း မသိမ်းနိုင်ပါ။ လက်ရှိဖွင့်ထားချိန်အတွက်သာ မှတ်ထားပါတယ်။'); });
  };
  return <Context.Provider value={{ ids, ready, error, toggle }}>{children}</Context.Provider>;
}
export const useFavorites = () => useContext(Context);

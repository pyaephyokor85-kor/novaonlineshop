import { Platform, Text } from 'react-native';
const paths = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z',
  search: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  profile: 'M20 21a8 8 0 0 0-16 0M16.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  lock: 'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  close: 'm6 6 12 12M18 6 6 18',
};
export default function ShopIcon({ name, size = 24, color = '#102B62', filled = false }: { name: keyof typeof paths; size?: number; color?: string; filled?: boolean }) {
  if (Platform.OS !== 'web') return <Text accessible={false} style={{ color, fontSize: size }}>{({ home: '⌂', search: '⌕', profile: '○', heart: filled ? '♥' : '♡', lock: '▣', close: '×' })[name]}</Text>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flexShrink: 0, pointerEvents: 'none' }}><path d={paths[name]} /></svg>;
}

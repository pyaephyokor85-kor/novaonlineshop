import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import './global.css';
import { novaCatalog } from './data/nova-catalog';

type Tab = 'home' | 'discover' | 'advisor' | 'profile';
type Product = { id: string; name: string; family: string; notes: string; price: string; color: string; accent: string; tag?: string; bioMyanmar?: string; originalReference?: string; brand?: string; category?: string; scentType?: string; tiktokCaption?: string; facebookPost?: string };
type PurchaseHistory = { productId: string; purchasedAt: string; quantity?: number; price?: string };
type Recommendation = { id: string; name: string; family: string[]; notes: string[]; price: string; score: number; matchedFamilies: string[]; matchedNotes: string[]; seasonalMatches: string[]; purchaseMatches: number; blocked: boolean };
type Message = { id: string; from: 'nova' | 'user'; text: string; recommendations?: Recommendation[] };
type FragranceProfile = { favoriteFamilies: string[]; preferredNotes: string[]; moods: string[]; occasions: string[]; dislikes: string[]; lastRecommendation?: string; updatedAt?: string };
const emptyProfile: FragranceProfile = { favoriteFamilies: [], preferredNotes: [], moods: [], occasions: [], dislikes: [] };
const PROFILE_ID_KEY = '@nova/fragrance-profile-id';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;
const getProfileId = async () => {
  const user = supabase ? (await supabase.auth.getSession()).data.session?.user : null;
  if (user) return user.id;
  let id = await AsyncStorage.getItem(PROFILE_ID_KEY);
  if (!id) {
    const session = await AsyncStorage.getItem('@nova/local-session');
    id = session?.startsWith('guest_') ? session : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(PROFILE_ID_KEY, id);
  }
  return id;
};
const guestProfileKey = (id: string) => `@nova/profile/${id}`;
const loadGuestProfile = async (id: string): Promise<FragranceProfile> => {
  const stored = await AsyncStorage.getItem(guestProfileKey(id));
  try { return stored ? { ...emptyProfile, ...JSON.parse(stored) } : emptyProfile; }
  catch { return emptyProfile; }
};
const isCloudUser = (id: string) => Boolean(supabase && id && !id.startsWith('guest_'));
const fromCloudProfile = (row: any): FragranceProfile => ({ favoriteFamilies: row.favorite_families || [], preferredNotes: row.preferred_notes || [], moods: row.moods || [], occasions: row.occasions || [], dislikes: row.dislikes || [], lastRecommendation: row.last_recommendation, updatedAt: row.updated_at });
const loadCloudProfile = async (userId: string) => { if (!supabase) return null; const { data, error } = await supabase.from('fragrance_profiles').select('*').eq('user_id', userId).maybeSingle(); if (error) throw error; return data ? fromCloudProfile(data) : emptyProfile; };
const saveCloudProfile = async (userId: string, profile: FragranceProfile) => { if (!supabase) return; const { error } = await supabase.from('fragrance_profiles').upsert({ user_id: userId, favorite_families: profile.favoriteFamilies, preferred_notes: profile.preferredNotes, moods: profile.moods, occasions: profile.occasions, dislikes: profile.dislikes, last_recommendation: profile.lastRecommendation }, { onConflict: 'user_id' }); if (error) throw error; };
const loadCloudPurchases = async (): Promise<PurchaseHistory[]> => { if (!supabase) return []; const { data, error } = await supabase.from('fragrance_purchases').select('product_id,purchased_at,quantity,price').order('purchased_at', { ascending: false }); if (error) throw error; return (data || []).map(row => ({ productId: row.product_id, purchasedAt: row.purchased_at, quantity: row.quantity, price: row.price || undefined })); };

const products: Product[] = novaCatalog.map(p => ({ ...p, family: p.familyLabel, notes: p.family.join(' · '), price: p.price, tag: p.category }));
const productImages: Record<string, any> = {
  'NV-001': require('./NV-001.jpg'),
  'NV-002': require('./NV-002.jpg'),
  'NV-003': require('./NV-003.jpg'),
  'NV-004': require('./NV-004.jpg'),
  'NV-005': require('./NV-005.jpg'),
  'NV-006': require('./NV-006.jpg'),
  'NV-007': require('./NV-007.jpg'),
  'NV-008': require('./NV-008.jpg'),
  'NV-009': require('./NV-009.jpg'),
  'NV-010': require('./NV-010.jpg'),
  'NV-011': require('./NV-011.jpg'),
  'NV-012': require('./NV-012.jpg'),
  'NV-013': require('./NV-013.jpg'),
  'NV-014': require('./NV-014.jpg'),
  'NV-015': require('./NV-015.jpg'),
  'NV-016': require('./NV-016.jpg'),
  'NV-017': require('./NV-017.jpg'),
  'NV-018': require('./NV-018.jpg'),
  'NV-019': require('./NV-019.jpg'),
  'NV-020': require('./NV-020.jpg'),
  'NV-021': require('./NV-021.jpg'),
  'NV-022': require('./NV-022.jpg'),
  'NV-023': require('./NV-023.jpg'),
  'NV-024': require('./NV-024.jpg'),
  'NV-025': require('./NV-025.jpg'),
  'NV-026': require('./NV-026.jpg'),
  'NV-027': require('./NV-027.jpg'),
  'NV-028': require('./NV-028.jpg'),
  'NV-029': require('./NV-029.jpg'),
  'NV-030': require('./NV-030.jpg'),
  'NV-031': require('./NV-031.jpg'),
  'NV-032': require('./NV-032.jpg'),
};

function Bottle({ p, small = false }: { p: Product; small?: boolean }) {
  if (productImages[p.id]) return <View style={[s.bottleWrap, small && s.bottleWrapSmall]}><Image source={productImages[p.id]} style={[s.productPhoto, small && s.productPhotoSmall]} resizeMode="contain" /></View>;
  return <View style={[s.bottleWrap, small && s.bottleWrapSmall]}><View style={[s.cap, { backgroundColor: p.accent }, small && s.capSmall]} /><View style={[s.bottle, { backgroundColor: p.color }, small && s.bottleSmall]}><View style={s.shine} /><Text style={[s.bottleMark, small && s.bottleMarkSmall]}>N</Text>{!small && <Text style={s.bottleWord}>NOVA</Text>}</View></View>;
}
function Card({ p, onPress }: { p: Product; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.pressed]}><View style={s.productImage}>{p.tag && <Text style={s.cardTag}>{p.tag}</Text>}<Bottle p={p} small /><Text style={s.heart}>♡</Text></View><View style={s.cardBody}><View style={s.row}><Text style={s.productName}>{p.name}</Text><Text style={s.price}>{p.price}</Text></View><Text style={s.family}>{p.family}</Text><Text style={s.notes}>{p.notes}</Text></View></Pressable>;
}
function Home({ go, pick }: { go: (t: Tab) => void; pick: (p: Product) => void }) {
  return <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}><View style={s.top}><View><Text style={s.eyebrow}>GOOD EVENING</Text><Text style={s.heading}>Find your aura.</Text></View><View style={s.avatar}><Text style={s.avatarText}>N</Text></View></View><Pressable onPress={() => go('advisor')} style={({ pressed }) => [s.hero, pressed && s.pressed]}><View style={s.heroGlow} /><Text style={s.aiKicker}>NOVA INTELLIGENCE</Text><Text style={s.heroTitle}>Your signature scent{`\n`}is closer than you think.</Text><Text style={s.heroCopy}>Tell me how you want to feel. I'll curate the rest.</Text><View style={s.heroButton}><Text style={s.heroButtonText}>Talk to your scent advisor  →</Text></View></Pressable><View style={s.sectionHead}><View><Text style={s.sectionTitle}>Curated for you</Text><Text style={s.sectionSub}>Based on your mood and style</Text></View><Pressable onPress={() => go('discover')}><Text style={s.seeAll}>See all</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rowList}>{products.slice(0, 3).map(p => <Card key={p.id} p={p} onPress={() => pick(p)} />)}</ScrollView><View style={s.editCard}><View style={{ flex: 1 }}><Text style={s.eyebrow}>THE NOVA EDIT</Text><Text style={s.editTitle}>Layering, made personal.</Text><Text style={s.editCopy}>Build a scent that is unmistakably yours with our intelligent layering guide.</Text><Pressable onPress={() => go('advisor')}><Text style={s.link}>Explore the edit  →</Text></Pressable></View><View style={s.orb}><Text style={s.orbText}>✦</Text></View></View></ScrollView>;
}
function Discover({ pick }: { pick: (p: Product) => void }) {
  const [filter, setFilter] = useState('All'); const filters = ['All', 'Woody', 'Floral', 'Fresh', 'Oud'];
  const list = filter === 'All' ? products : products.filter(p => p.family.toLowerCase().includes(filter.toLowerCase()));
  return <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}><View style={s.top}><View><Text style={s.eyebrow}>THE COLLECTION</Text><Text style={s.heading}>Discover NOVA.</Text></View><Text style={s.search}>⌕</Text></View><Text style={s.intro}>32 compositions. Infinite ways to be remembered.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{filters.map(f => <Pressable key={f} onPress={() => setFilter(f)} style={[s.filter, filter === f && s.filterOn]}><Text style={[s.filterText, filter === f && s.filterTextOn]}>{f}</Text></Pressable>)}</ScrollView><View style={s.grid}>{list.map(p => <Card key={p.id} p={p} onPress={() => pick(p)} />)}</View></ScrollView>;
}
const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
const apiEndpoint = (route: string) => {
  if (Platform.OS !== 'web' && !API_URL) throw new Error('Set EXPO_PUBLIC_API_URL to your API server address for the mobile app.');
  return `${API_URL}${route}`;
};
function ProfileMemory({ profile }: { profile: FragranceProfile }) {
  const items = [...profile.favoriteFamilies, ...profile.preferredNotes].slice(0, 4);
  return <View style={s.memoryCard}><View style={s.memoryTitleRow}><Text style={s.memoryTitle}>Your fragrance profile</Text><Text style={s.memorySpark}>✦</Text></View><Text style={s.memoryCopy}>{items.length ? 'NOVA is learning your scent signature.' : 'Chat with NOVA to start building your scent signature.'}</Text><View style={s.chipRow}>{items.map(item => <View style={s.chip} key={item}><Text style={s.chipText}>{item}</Text></View>)}</View>{profile.moods.length > 0 && <Text style={s.memoryMeta}>Mood: {profile.moods.slice(0, 2).join(' · ')}</Text>}</View>;
}
function RecommendationStrip({ items }: { items: Recommendation[] }) {
  return <View className="mt-1"><Text className="mb-2 text-[10px] font-bold tracking-[1.5px] text-nova-clay">CURATED FOR YOUR PROFILE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-1">{items.filter(item => !item.blocked).slice(0, 3).map(item => <View key={item.id} className="w-40 rounded-2xl border border-[#E8DED1] bg-[#FFFDF9] p-3"><Text className="text-[12px] font-bold text-nova-ink">{item.name}</Text><Text className="mt-1 text-[10px] text-nova-clay">{item.family.join(' · ')}</Text><Text className="mt-2 text-[10px] leading-4 text-nova-muted">{item.matchedNotes.length ? `Matches ${item.matchedNotes.join(', ')}` : 'A balanced NOVA signature'}</Text>{item.seasonalMatches.length ? <Text className="mt-1 text-[10px] leading-4 text-[#A8754B]">Seasonal: {item.seasonalMatches.slice(0, 2).join(', ')}</Text> : null}{item.purchaseMatches > 0 ? <Text className="mt-1 text-[10px] leading-4 text-[#6D8B6F]">Based on your purchase history</Text> : null}<Text className="mt-2 text-[11px] font-bold text-nova-ink">{item.price}</Text></View>)}</ScrollView></View>;
}
function Advisor() {
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const [profile, setProfile] = useState<FragranceProfile>(emptyProfile); const [profileId, setProfileId] = useState(''); const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistory[]>([]);
  const [messages, setMessages] = useState<Message[]>([{ id: '1', from: 'nova', text: 'Hello, I’m NOVA. Think of me as your personal scent curator. How do you want to feel today?' }, { id: '2', from: 'nova', text: 'I can remember your favorite notes, moods, occasions, and dislikes to make future recommendations more personal.' }]);
  useEffect(() => { getProfileId().then(async id => { setProfileId(id); try { if (isCloudUser(id)) { const cloud = await loadCloudProfile(id); setProfile(cloud || emptyProfile); } else { setProfile(await loadGuestProfile(id)); } } catch {} }); }, []);
  useEffect(() => { if (isCloudUser(profileId)) loadCloudPurchases().then(setPurchaseHistory).catch(() => {}); }, [profileId]);
  const send = async () => { const text = input.trim(); if (!text || loading || !profileId) return; const next = [...messages, { id: `${Date.now()}u`, from: 'user' as const, text }]; setMessages(next); setInput(''); setLoading(true); try { const res = await fetch(apiEndpoint('/api/scent-advisor'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, message: text, profile, purchaseHistory, history: messages.slice(-10) }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Advisor unavailable'); const nextProfile = data.profile || profile; setProfile(nextProfile); if (isCloudUser(profileId)) { try { await saveCloudProfile(profileId, nextProfile); } catch { /* Do not discard a valid advisor reply on cloud sync failure. */ } } else await AsyncStorage.setItem(guestProfileKey(profileId), JSON.stringify(nextProfile)); setMessages(current => [...current, { id: `${Date.now()}n`, from: 'nova', text: data.reply, recommendations: data.recommendations || [] }]); } catch { setMessages(current => [...current, { id: `${Date.now()}e`, from: 'nova', text: 'I’m having trouble reaching my scent studio. Please check the API server and try again.' }]); } finally { setLoading(false); } };
  return <SafeAreaView style={s.advisor}><View style={s.advisorHead}><View><Text style={s.eyebrow}>NOVA INTELLIGENCE</Text><Text style={s.heading}>Your scent advisor.</Text></View><Text style={s.online}>{loading ? '● THINKING' : '● ONLINE'}</Text></View><ScrollView contentContainerStyle={s.chat}><ProfileMemory profile={profile} />{messages.map(m => <View key={m.id} style={[s.bubble, m.from === 'user' && s.userBubble]}><Text style={[s.bubbleText, m.from === 'user' && s.userText]}>{m.text}</Text>{m.recommendations?.length ? <RecommendationStrip items={m.recommendations} /> : null}</View>)}{loading && <View style={s.bubble}><Text style={s.bubbleText}>Learning your preferences…</Text></View>}</ScrollView><View style={s.composer}><TextInput value={input} onChangeText={setInput} placeholder="Tell me a mood, note, or occasion..." placeholderTextColor="#9C968D" style={s.input} onSubmitEditing={send} returnKeyType="send" editable={!loading}/><Pressable onPress={send} style={s.send}><Text style={s.sendText}>↑</Text></Pressable></View></SafeAreaView>;
}
function Profile({ onSignOut }: { onSignOut: () => void }) {
  const [profile, setProfile] = useState<FragranceProfile>(emptyProfile);
  useEffect(() => { getProfileId().then(async id => { try { if (isCloudUser(id)) setProfile((await loadCloudProfile(id)) || emptyProfile); else { setProfile(await loadGuestProfile(id)); } } catch {} }); }, []);
  const groups = [['Favorite families', profile.favoriteFamilies], ['Preferred notes', profile.preferredNotes], ['Best for', profile.occasions], ['Avoids', profile.dislikes]] as const;
  return <ScrollView contentContainerStyle={s.page}><View style={s.profileTop}><View style={s.largeAvatar}><Text style={s.largeAvatarText}>N</Text></View><Text style={s.profileName}>NOVA guest</Text><Text style={s.profileSub}>Your scent journey, remembered.</Text></View><View style={s.profileMemory}><Text style={s.profileMemoryKicker}>VIRTUAL FRAGRANCE PROFILE</Text><Text style={s.profileMemoryTitle}>A signature that evolves with you.</Text><Text style={s.profileMemoryCopy}>Every conversation helps NOVA understand your taste — privately and progressively.</Text></View>{groups.map(([label, values]) => <View key={label} style={s.profileRow}><Text style={s.profileRowLabel}>{label}</Text><Text style={s.profileRowValue}>{values.length ? values.join(' · ') : 'Not discovered yet'}</Text></View>)}{['♡  Saved scents', '◷  Scent history', '⌁  Preferences', '◌  Help & support'].map(x => <Pressable key={x} style={s.menu}><Text style={s.menuText}>{x}</Text><Text style={s.chevron}>›</Text></Pressable>)}<Pressable onPress={onSignOut} style={s.menu}><Text style={[s.menuText, { color: '#A35F4B' }]}>↪  Sign out</Text><Text style={s.chevron}>›</Text></Pressable></ScrollView>;
}
function AuthScreen({ onAuth }: { onAuth: (session: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    if (!supabase) { setError('Account login is not configured yet. You can continue as a guest.'); return; }
    if (!email.trim() || password.length < 6) { setError('Enter an email and a password with at least 6 characters.'); return; }
    submittingRef.current = true; setSubmitting(true);
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (result.data.session) {
        await AsyncStorage.removeItem('@nova/local-session');
        onAuth(result.data.session.user.id);
      } else setError('Check your email to confirm your account, then log in.');
    } catch (error: any) { setError(error?.message || 'Unable to sign in. Please try again.'); }
    finally { submittingRef.current = false; setSubmitting(false); }
  };
  const continueGuest = async () => {
    if (submittingRef.current) return;
    try { const identity = await getProfileId(); await AsyncStorage.setItem('@nova/local-session', identity); onAuth(identity); }
    catch { setError('Unable to save your guest session. Please try again.'); }
  };
  return <SafeAreaView className="flex-1 bg-nova-cream"><ScrollView contentContainerClassName="items-center px-7 pb-12 pt-14" showsVerticalScrollIndicator={false}><View className="h-16 w-16 items-center justify-center rounded-full bg-nova-ink shadow-lg"><Text className="text-3xl font-bold text-nova-gold">N</Text></View><Text className="mt-4 text-lg font-bold tracking-[6px] text-nova-ink">NOVA</Text><Text className="mt-2 text-center text-[13px] text-nova-clay">A more personal way to wear fragrance.</Text><View className="mt-9 w-full rounded-[24px] border border-[#EFE7DD] bg-nova-paper p-6 shadow-xl"><Text className="text-[25px] font-semibold text-nova-ink">{mode === 'login' ? 'Welcome back.' : 'Create your scent space.'}</Text><Text className="mt-2 text-xs leading-5 text-nova-muted">{mode === 'login' ? 'Continue your fragrance journey.' : 'Your preferences will shape every recommendation.'}</Text><TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#A39A91" keyboardType="email-address" autoCapitalize="none" className="mt-5 rounded-xl bg-[#F3EEE7] px-4 py-3.5 text-[13px] text-nova-ink"/><TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#A39A91" secureTextEntry className="mt-2 rounded-xl bg-[#F3EEE7] px-4 py-3.5 text-[13px] text-nova-ink"/><Pressable onPress={submit} disabled={submitting} className="mt-4 items-center rounded-xl bg-nova-ink py-4 active:opacity-80"><Text className="text-[13px] font-bold text-[#F7EEE3]">{submitting ? 'Please wait…' : mode === 'login' ? 'Log in  →' : 'Create account  →'}</Text></Pressable><View className="mt-5 flex-row justify-center"><Text className="text-xs text-nova-muted">{mode === 'login' ? 'New to NOVA?' : 'Already have an account?'}</Text><Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}><Text className="text-xs font-bold text-nova-clay">{mode === 'login' ? ' Create account' : ' Log in'}</Text></Pressable></View></View>{error ? <Text className="mt-4 text-center text-[11px] leading-4 text-[#A35F4B]">{error}</Text> : null}<Pressable onPress={continueGuest}><Text className="mt-6 text-[13px] font-bold text-nova-clay">Continue as guest for now</Text></Pressable><Text className="mt-3 text-center text-[10px] text-[#B3ABA2]">Guest preferences stay on this device. Signed-in profiles sync when configured.</Text></ScrollView></SafeAreaView>;
}
function Detail({ p, close }: { p: Product; close: () => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [quantity, setQuantity] = useState('1'); const [sending, setSending] = useState(false); const sendingRef = useRef(false); const [orderStatus, setOrderStatus] = useState('');
  const submitOrder = async () => {
    if (sendingRef.current) return;
    setOrderStatus('');
    if (!name.trim() || !phone.trim() || !address.trim()) { setOrderStatus('Please enter your name, phone number, and delivery address.'); return; }
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount < 1 || amount > 99) { setOrderStatus('Quantity must be a whole number between 1 and 99.'); return; }
    sendingRef.current = true; setSending(true);
    try {
      const res = await fetch(apiEndpoint('/api/order-notification'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: name.trim(), phone: phone.trim(), address: address.trim(), quantity: amount, product: { id: p.id } }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) throw new Error(data.error || 'Order notification failed');
      setOrderStatus('Order request sent. NOVA will contact you to confirm availability, delivery fees, and payment.');
      setName(''); setPhone(''); setAddress(''); setQuantity('1');
    } catch (error: any) { setOrderStatus(error?.message || 'Unable to send order. Please try again later.'); }
    finally { sendingRef.current = false; setSending(false); }
  };
  const field = { backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#E6DDD3', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#302A25', fontSize: 13, marginTop: 9 } as const;
  return <SafeAreaView style={s.detail}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 35 }}><Pressable onPress={close}><Text style={s.back}>‹  Back</Text></Pressable><View style={s.detailVisual}><Bottle p={p} /></View><Text style={s.eyebrow}>{p.family.toUpperCase()}</Text><Text style={s.detailTitle}>{p.name}</Text><Text style={s.detailNotes}>{p.notes}</Text><Text style={s.detailDescription}>{p.bioMyanmar || 'A luminous composition designed to stay close to the skin and linger in memory. Discover your new signature.'}</Text><Text style={s.detailMeta}>{p.category} · {p.brand} · Inspired by {p.originalReference}</Text><Text style={{ color: '#9B6E49', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 26 }}>ORDER VIA NOVA</Text><TextInput value={name} onChangeText={setName} placeholder="Customer name" placeholderTextColor="#A39A91" style={field} /><TextInput value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor="#A39A91" keyboardType="phone-pad" style={field} /><TextInput value={address} onChangeText={setAddress} placeholder="Delivery address" placeholderTextColor="#A39A91" multiline style={[field, { minHeight: 70, textAlignVertical: 'top' }]} /><View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9 }}><TextInput value={quantity} onChangeText={setQuantity} placeholder="Qty" placeholderTextColor="#A39A91" keyboardType="number-pad" style={[field, { flex: 1, marginTop: 0 }]} /><Text style={{ color: '#9B6E49', fontSize: 18, fontWeight: '700', marginLeft: 14 }}>{p.price}</Text></View><Pressable onPress={submitOrder} disabled={sending} style={[s.add, { marginTop: 16, alignItems: 'center', opacity: sending ? 0.6 : 1 }]}><Text style={s.addText}>{sending ? 'Sending order…' : 'Send order request  →'}</Text></Pressable>{orderStatus ? <Text accessibilityRole="alert" style={{ color: '#80583D', marginTop: 12, lineHeight: 20 }}>{orderStatus}</Text> : null}</ScrollView></SafeAreaView>;
}
export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [selected, setSelected] = useState<Product | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    let active = true;
    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(previous => nextSession?.user.id || (previous?.startsWith('guest_') ? previous : null));
    }).data.subscription;
    (async () => {
      try {
        const cloudSession = supabase ? (await supabase.auth.getSession()).data.session : null;
        const localSession = await AsyncStorage.getItem('@nova/local-session');
        if (active) setSession(cloudSession?.user.id || (localSession?.startsWith('guest_') ? localSession : null));
      } catch { if (active) setSession(null); }
      finally { if (active) setBooting(false); }
    })();
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
 if (booting) return <SafeAreaView style={s.auth}><StatusBar style="dark" /></SafeAreaView>; if (!session) return <><StatusBar style="dark" /><AuthScreen onAuth={setSession} /></>; if (selected) return <><StatusBar style="dark" /><Detail p={selected} close={() => setSelected(null)} /></>; const screen = tab === 'home' ? <Home go={setTab} pick={setSelected} /> : tab === 'discover' ? <Discover pick={setSelected} /> : tab === 'advisor' ? <Advisor /> : <Profile onSignOut={async () => { if (supabase) await supabase.auth.signOut(); await AsyncStorage.removeItem('@nova/local-session'); setTab('home'); setSelected(null); setSession(null); }} />; return <SafeAreaView style={s.app}><StatusBar style="dark" />{screen}<View style={s.nav}>{([['home', '⌂', 'Home'], ['discover', '◒', 'Discover'], ['advisor', '✦', 'Advisor'], ['profile', '○', 'Profile']] as const).map(([key, icon, label]) => <Pressable key={key} onPress={() => setTab(key)} style={s.navItem}><Text style={[s.navIcon, tab === key && s.navActive]}>{icon}</Text><Text style={[s.navLabel, tab === key && s.navActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>; }

const s = StyleSheet.create({ app: { flex: 1, backgroundColor: '#F8F6F1' }, page: { padding: 24, paddingBottom: 110 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 }, eyebrow: { fontSize: 10, letterSpacing: 2, color: '#9B6E49', fontWeight: '700' }, heading: { color: '#201E1B', fontSize: 29, fontWeight: '500', marginTop: 6, letterSpacing: -1 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#25221F', justifyContent: 'center', alignItems: 'center' }, avatarText: { color: '#E7C99D', fontSize: 18, fontWeight: '700' }, hero: { height: 286, borderRadius: 24, padding: 24, backgroundColor: '#2C2825', overflow: 'hidden', marginBottom: 30 }, heroGlow: { position: 'absolute', right: -35, top: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: '#6E4934', opacity: .7 }, aiKicker: { color: '#D7AA7A', fontSize: 10, fontWeight: '700', letterSpacing: 2 }, heroTitle: { color: '#FFF9F1', fontSize: 27, lineHeight: 32, marginTop: 15, fontWeight: '500', letterSpacing: -.5 }, heroCopy: { color: '#C5BDB4', fontSize: 13, lineHeight: 20, marginTop: 14, width: '77%' }, heroButton: { position: 'absolute', bottom: 22, left: 24, borderBottomWidth: 1, borderColor: '#B8895C', paddingBottom: 5 }, heroButtonText: { color: '#E8C7A1', fontSize: 12, fontWeight: '600' }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 15 }, sectionTitle: { color: '#24211E', fontSize: 20, fontWeight: '600' }, sectionSub: { color: '#9B968E', fontSize: 12, marginTop: 5 }, seeAll: { color: '#9B6E49', fontWeight: '700', fontSize: 12 }, rowList: { gap: 14, paddingBottom: 28 }, card: { width: 215, backgroundColor: '#FFFDF9', borderRadius: 17, overflow: 'hidden', marginRight: 14 }, productImage: { height: 184, backgroundColor: '#F0E9DE', justifyContent: 'center', alignItems: 'center', position: 'relative' }, cardTag: { position: 'absolute', top: 12, left: 12, fontSize: 9, color: '#9B6E49', fontWeight: '700', letterSpacing: .5 }, heart: { position: 'absolute', right: 12, top: 9, color: '#716A62', fontSize: 22 }, cardBody: { padding: 14 }, row: { flexDirection: 'row', justifyContent: 'space-between' }, productName: { color: '#25211E', fontSize: 14, fontWeight: '700' }, price: { color: '#9B6E49', fontWeight: '700', fontSize: 13 }, family: { color: '#8D867D', fontSize: 11, marginTop: 5 }, notes: { color: '#B1AAA1', fontSize: 10, marginTop: 7 }, bottleWrap: { alignItems: 'center', justifyContent: 'flex-end', height: 178 }, bottleWrapSmall: { height: 135 }, productPhoto: { width: 190, height: 178, borderRadius: 12 }, productPhotoSmall: { width: 135, height: 125, borderRadius: 10 }, cap: { width: 39, height: 34, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: .95 }, capSmall: { width: 28, height: 25 }, bottle: { width: 75, height: 112, borderRadius: 7, justifyContent: 'center', alignItems: 'center', shadowColor: '#5A3E2C', shadowOpacity: .18, shadowRadius: 8, elevation: 4 }, bottleSmall: { width: 55, height: 82, borderRadius: 6 }, shine: { position: 'absolute', left: 9, top: 10, width: 9, height: 78, borderRadius: 4, backgroundColor: '#FFF', opacity: .22 }, bottleMark: { color: '#6D4C3A', fontSize: 28, fontWeight: '300', fontFamily: 'serif' }, bottleMarkSmall: { fontSize: 21 }, bottleWord: { color: '#6D4C3A', fontSize: 7, letterSpacing: 2, marginTop: 4 }, editCard: { backgroundColor: '#E9DFD1', borderRadius: 20, padding: 20, minHeight: 170, flexDirection: 'row', overflow: 'hidden' }, editTitle: { color: '#382B24', fontSize: 20, fontWeight: '600', marginTop: 8 }, editCopy: { color: '#7D6B5D', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 215 }, link: { color: '#93623D', fontSize: 12, fontWeight: '700', marginTop: 15 }, orb: { width: 85, height: 85, borderRadius: 43, backgroundColor: '#BE936D', alignItems: 'center', justifyContent: 'center', marginTop: 28, marginRight: -20 }, orbText: { color: '#FAE9CE', fontSize: 34 }, intro: { color: '#766F67', lineHeight: 20, fontSize: 14, marginBottom: 20 }, search: { fontSize: 28, color: '#7E756D' }, filters: { gap: 8, paddingBottom: 25 }, filter: { paddingVertical: 9, paddingHorizontal: 17, borderRadius: 18, borderWidth: 1, borderColor: '#E2DCD2' }, filterOn: { backgroundColor: '#2A2521', borderColor: '#2A2521' }, filterText: { color: '#9B948B', fontSize: 12 }, filterTextOn: { color: '#F7EEE3', fontWeight: '700' }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }, advisor: { flex: 1, backgroundColor: '#F8F6F1' }, advisorHead: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, online: { color: '#6D8B6F', fontSize: 10, letterSpacing: 1, fontWeight: '700' }, chat: { padding: 24, paddingTop: 10, gap: 13, paddingBottom: 30 }, bubble: { backgroundColor: '#EDE5DA', padding: 15, borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '88%' }, userBubble: { backgroundColor: '#2C2825', alignSelf: 'flex-end', borderBottomLeftRadius: 18, borderBottomRightRadius: 4 }, bubbleText: { color: '#4D4239', fontSize: 14, lineHeight: 21 }, userText: { color: '#F7EEE3' }, composer: { flexDirection: 'row', padding: 14, borderTopWidth: 1, borderTopColor: '#E6E0D7', backgroundColor: '#FFFCF7', alignItems: 'center' }, input: { flex: 1, paddingHorizontal: 15, paddingVertical: 12, color: '#2B2622', backgroundColor: '#F3EEE7', borderRadius: 24, fontSize: 13 }, send: { width: 43, height: 43, borderRadius: 22, marginLeft: 8, backgroundColor: '#9B6E49', alignItems: 'center', justifyContent: 'center' }, sendText: { color: 'white', fontSize: 22 }, memoryCard: { backgroundColor: '#E9DFD1', borderRadius: 18, padding: 16, marginBottom: 14 }, memoryTitleRow: { flexDirection: 'row', justifyContent: 'space-between' }, memoryTitle: { color: '#3B2D25', fontSize: 15, fontWeight: '700' }, memorySpark: { color: '#9B6E49', fontSize: 18 }, memoryCopy: { color: '#796B60', fontSize: 12, lineHeight: 18, marginTop: 6 }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }, chip: { backgroundColor: '#F8F1E8', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 }, chipText: { color: '#8E6445', fontSize: 10, fontWeight: '600' }, memoryMeta: { color: '#967457', fontSize: 11, marginTop: 9 }, profileMemory: { backgroundColor: '#2C2825', borderRadius: 20, padding: 20, marginBottom: 20 }, profileMemoryKicker: { color: '#D7AA7A', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, profileMemoryTitle: { color: '#FFF9F1', fontSize: 22, fontWeight: '500', marginTop: 10 }, profileMemoryCopy: { color: '#C5BDB4', fontSize: 12, lineHeight: 18, marginTop: 8 }, profileRow: { backgroundColor: '#FFFDF9', borderBottomWidth: 1, borderBottomColor: '#F0ECE6', padding: 15 }, profileRowLabel: { color: '#8E867E', fontSize: 11 }, profileRowValue: { color: '#3F3831', fontSize: 13, marginTop: 5 }, auth: { flex: 1, backgroundColor: '#F8F6F1' }, authContent: { padding: 28, alignItems: 'center', paddingTop: 56 }, authLogo: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2C2825', alignItems: 'center', justifyContent: 'center' }, authLogoText: { color: '#E7C99D', fontSize: 28, fontWeight: '700' }, authBrand: { color: '#2C2825', fontSize: 19, letterSpacing: 6, fontWeight: '700', marginTop: 15 }, authTagline: { color: '#9B6E49', fontSize: 13, marginTop: 8, textAlign: 'center' }, authPanel: { alignSelf: 'stretch', backgroundColor: '#FFFDF9', borderRadius: 22, padding: 22, marginTop: 38 }, authTitle: { color: '#29231F', fontSize: 24, fontWeight: '600' }, authSub: { color: '#958C83', fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 20 }, authInput: { backgroundColor: '#F3EEE7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: '#302A25', fontSize: 13, marginBottom: 10 }, authButton: { backgroundColor: '#2C2825', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 }, authButtonText: { color: '#F7EEE3', fontSize: 13, fontWeight: '700' }, authSwitch: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 }, authSwitchText: { color: '#958C83', fontSize: 12 }, authLink: { color: '#9B6E49', fontSize: 12, fontWeight: '700' }, guestLink: { color: '#9B6E49', fontSize: 13, fontWeight: '700', marginTop: 25 }, authError: { color: '#A35F4B', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16 }, localNote: { color: '#B3ABA2', fontSize: 10, marginTop: 14, textAlign: 'center' }, profileTop: { alignItems: 'center', paddingVertical: 35 }, largeAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#2C2825', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, largeAvatarText: { color: '#E7C99D', fontSize: 34, fontWeight: '700' }, profileName: { fontSize: 20, color: '#28231F', fontWeight: '600' }, profileSub: { color: '#9C958C', marginTop: 7 }, menu: { backgroundColor: '#FFFDF9', padding: 19, borderBottomWidth: 1, borderBottomColor: '#F0ECE6', flexDirection: 'row', justifyContent: 'space-between' }, menuText: { color: '#4D4640', fontSize: 14 }, chevron: { color: '#B4ACA2', fontSize: 22 }, nav: { flexShrink: 0, height: 76, backgroundColor: '#FFFCF7', borderTopWidth: 1, borderTopColor: '#EEE8DF', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 11 }, navItem: { alignItems: 'center', width: 70 }, navIcon: { color: '#B5ADA3', fontSize: 22, height: 28 }, navLabel: { color: '#A7A097', fontSize: 10, marginTop: 3 }, navActive: { color: '#9B6E49', fontWeight: '700' }, pressed: { opacity: .78 }, detail: { flex: 1, padding: 24, backgroundColor: '#F8F6F1' }, back: { color: '#8F694A', fontSize: 14, marginBottom: 15 }, detailVisual: { height: 340, backgroundColor: '#EDE3D5', borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 25 }, detailTitle: { fontSize: 32, color: '#28231F', fontWeight: '500', marginTop: 8 }, detailNotes: { color: '#9B6E49', fontSize: 14, marginTop: 8 }, detailDescription: { color: '#7F776E', fontSize: 14, lineHeight: 22, marginTop: 23, maxWidth: 320 }, detailMeta: { color: '#9B6E49', fontSize: 11, lineHeight: 17, marginTop: 12, maxWidth: 320 }, detailBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 35 }, detailPrice: { color: '#2A2521', fontSize: 24, fontWeight: '600' }, add: { backgroundColor: '#2C2825', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 21 }, addText: { color: '#F7EEE3', fontWeight: '700', fontSize: 12 } });

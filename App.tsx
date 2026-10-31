import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import './global.css';
import AdminRoute from './AdminRoute';
import { novaCatalog } from './data/nova-catalog';
import shopPricing from './data/shop-pricing.json';
type BottleSize = keyof typeof shopPricing.sizes;
const money = (amount: number) => `${amount.toLocaleString('en-US')} Ks`;

type Tab = 'home' | 'discover' | 'advisor' | 'profile';
type Product = { id: string; name: string; family: string; notes: string; price: string; color: string; accent: string; tag?: string; bioMyanmar?: string; originalReference?: string; brand?: string; category?: string; scentType?: string; tiktokCaption?: string; facebookPost?: string };
type PurchaseHistory = { productId: string; purchasedAt: string; quantity?: number; price?: string };
type Recommendation = { id: string; name: string; family: string[]; notes: string[]; price: string; score: number; matchedFamilies: string[]; matchedNotes: string[]; seasonalMatches: string[]; purchaseMatches: number; blocked: boolean };
type Message = { id: string; from: 'nova' | 'user'; text: string; recommendations?: Recommendation[] };
type FragranceProfile = { favoriteFamilies: string[]; preferredNotes: string[]; moods: string[]; occasions: string[]; dislikes: string[]; lastRecommendation?: string; updatedAt?: string };
const emptyProfile: FragranceProfile = { favoriteFamilies: [], preferredNotes: [], moods: [], occasions: [], dislikes: [] };
const PROFILE_ID_KEY = '@nova/fragrance-profile-id';
const SUPABASE_URL = process.env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
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

const products: Product[] = novaCatalog.map(p => ({ ...p, family: p.familyLabel, notes: p.family.join(' · '), price: shopPricing.priceLabel, tag: p.category }));
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
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 360 || fontScale > 1.2;
  const cardWidth = narrow ? '100%' : Math.max(142, (Math.min(width, 760) - 60) / 2);
  return <Pressable onPress={onPress} style={({ pressed }) => [s.card, { width: cardWidth }, pressed && s.pressed]}><View style={s.productImage}>{p.tag && <Text style={s.cardTag}>{p.tag}</Text>}<Bottle p={p} small /><Text style={s.heart}>♡</Text></View><View style={s.cardBody}><View style={s.productRow}><Text style={s.productName}>{p.name}</Text><Text style={s.price}>{p.price}</Text></View><Text style={s.family}>{p.family}</Text><Text style={s.notes}>{p.notes}</Text></View></Pressable>;
}
// Change this copy when the shop has a new announcement. No unverified offers are shown.
const HOME_NOTICE = 'NOVA မှ ကြိုဆိုပါတယ် · သင့်အတွက် ရနံ့ကို အတူရွေးချယ်မယ်';
type Showcase = { title: string; description: string; image_url: string | null; cta: 'discover' | 'advisor'; updated_at?: string };
function LiveShowcase({ go }: { go: (t: Tab) => void }) {
  const [board, setBoard] = useState<Showcase | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(apiEndpoint('/api/showcase'));
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setBoard(payload.board || null);
      } catch { /* Preview can still show its normal homepage without the board. */ }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!board) return null;
  return <View style={{ marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E0D6', padding: 15 }}>
    <Text style={{ color: '#A17A2C', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>NOVA · LIVE SHOWCASE</Text>
    {board.image_url ? <Image source={{ uri: board.image_url }} resizeMode="contain" style={{ width: '100%', height: 180, marginTop: 8 }} /> : null}
    <Text style={{ color: '#102856', fontSize: 19, fontWeight: '700', marginTop: 9 }}>{board.title}</Text>
    <Text style={{ color: '#34435B', marginTop: 5, lineHeight: 21 }}>{board.description}</Text>
    <Pressable accessibilityRole="button" onPress={() => go(board.cta)} style={{ backgroundColor: '#102856', borderRadius: 10, padding: 12, marginTop: 12, alignSelf: 'flex-start' }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{board.cta === 'advisor' ? 'Ask NOVA →' : 'Explore Scents →'}</Text></Pressable>
  </View>;
}
function Home({ go, pick }: { go: (t: Tab) => void; pick: (p: Product) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const heroStack = width < 360 || fontScale > 1.2;
  const adviserStack = width < 360 || fontScale > 1.2 || width > 700;
  const adviserChips = ['Fresh', 'For work', 'By mood'];
  return <ScrollView contentContainerStyle={s.homePage} showsVerticalScrollIndicator={false}>
    <View style={s.notice} accessibilityRole="text"><Text style={s.noticeLabel}>NOTICE</Text><Text style={s.noticeCopy}>{shopPricing.priceLabel} · {shopPricing.paymentLabel}</Text></View>
    <View style={s.homeContent}>
      <View style={s.brandRow}><Image source={require('./assets/nova-logo-authentic.png')} style={s.brandLogo} resizeMode="contain" accessibilityLabel="NOVA" /><Pressable accessibilityRole="button" accessibilityLabel="Open your NOVA account" onPress={() => go('profile')} style={s.brandAccount}><Text style={s.brandAccountText}>Account</Text></Pressable></View>
      <View style={[s.hero, heroStack && s.heroStack]}><View style={[s.heroCopyBlock, heroStack && s.heroCopyStack]}><Text style={s.heroKicker}>NOVA FRAGRANCE</Text><Text style={s.heroTitle}>Your scent.{`\n`}Your story.</Text><Text style={s.heroCopy}>သင့်ရဲ့ စတိုင်နဲ့ လိုက်ဖက်မယ့် ရနံ့ကို ရှာဖွေလိုက်ပါ။</Text><Pressable accessibilityRole="button" accessibilityLabel="Explore NOVA scents" onPress={() => go('discover')} style={s.heroButton}><Text style={s.heroButtonText}>Explore scents  →</Text></Pressable></View><Image source={require('./assets/nova-perfume-set.png')} style={[s.heroImage, heroStack && s.heroImageStack]} resizeMode="contain" accessibilityLabel="NOVA perfume set" /></View>
      <LiveShowcase go={go} />
      <View style={[s.adviserCard, adviserStack && s.adviserCardStack]}><View style={[s.adviserWords, adviserStack && s.adviserWordsStack]}><Text style={s.adviserKicker}>A LITTLE HELP, FROM NOVA</Text><Text style={s.adviserTitle}>Meet your Scent Adviser</Text><Text style={s.adviserCopy}>မေးလိုက်ပါ။ သင့်စိတ်ခံစားချက်နဲ့ အချိန်အခါအလိုက် ရနံ့ရွေးပေးမယ်။</Text><View style={s.adviserChips}>{adviserChips.map(chip => <Pressable key={chip} accessibilityRole="button" accessibilityLabel={`Ask NOVA about ${chip} scents`} onPress={() => go('advisor')} style={s.adviserChip}><Text style={s.adviserChipText}>{chip}</Text></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Ask NOVA Scent Adviser" onPress={() => go('advisor')} style={s.adviserCta}><Text style={s.adviserCtaText}>Ask NOVA  →</Text></Pressable></View><View style={[s.robotFrame, adviserStack && s.robotFrameStack]}><Image source={require('./assets/nova-ai-robot.jpg')} style={s.robotImage} resizeMode="contain" accessible={false} /></View></View>
      <View style={s.sectionHead}><View><Text style={s.sectionTitle}>Find your favourite</Text><Text style={s.sectionSub}>NOVA ရနံ့များကို ရှာဖွေပါ</Text></View><Pressable accessibilityRole="button" accessibilityLabel="See all NOVA scents" onPress={() => go('discover')} style={s.seeAllButton}><Text style={s.seeAll}>See all  →</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rowList}>{products.slice(0, 3).map(p => <Card key={p.id} p={p} onPress={() => pick(p)} />)}</ScrollView>
    </View>
  </ScrollView>;
}
function Discover({ pick }: { pick: (p: Product) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const singleColumn = width < 360 || fontScale > 1.2;
  const [filter, setFilter] = useState('All'); const filters = ['All', 'Woody', 'Floral', 'Fresh', 'Oud'];
  const list = filter === 'All' ? products : products.filter(p => p.family.toLowerCase().includes(filter.toLowerCase()));
  return <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}><View style={s.top}><View><Text style={s.eyebrow}>THE COLLECTION</Text><Text style={s.heading}>Discover NOVA.</Text></View><Text style={s.search}>⌕</Text></View><Text style={s.intro}>32 compositions. Infinite ways to be remembered.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{filters.map(f => <Pressable key={f} onPress={() => setFilter(f)} style={[s.filter, filter === f && s.filterOn]}><Text style={[s.filterText, filter === f && s.filterTextOn]}>{f}</Text></Pressable>)}</ScrollView><View style={[s.grid, singleColumn && s.gridSingle]}>{list.map(p => <Card key={p.id} p={p} onPress={() => pick(p)} />)}</View></ScrollView>;
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
function RecommendationStrip({ items, pick }: { items: Recommendation[]; pick: (p: Product) => void }) {
  return <View className="mt-1"><Text className="mb-2 text-[10px] font-bold tracking-[1.5px] text-nova-clay">CURATED FOR YOUR PROFILE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-1">{items.filter(item => !item.blocked).slice(0, 3).map(item => <View key={item.id} className="w-40 rounded-2xl border border-[#E8DED1] bg-[#FFFDF9] p-3"><Text className="text-[12px] font-bold text-nova-ink">{item.name}</Text><Text className="mt-1 text-[10px] text-nova-clay">{item.family.join(' · ')}</Text><Text className="mt-2 text-[10px] leading-4 text-nova-muted">{item.matchedNotes.length ? `Matches ${item.matchedNotes.join(', ')}` : 'A balanced NOVA signature'}</Text>{item.seasonalMatches.length ? <Text className="mt-1 text-[10px] leading-4 text-[#A8754B]">Seasonal: {item.seasonalMatches.slice(0, 2).join(', ')}</Text> : null}{item.purchaseMatches > 0 ? <Text className="mt-1 text-[10px] leading-4 text-[#6D8B6F]">Based on your purchase history</Text> : null}<Text className="mt-2 text-[11px] font-bold text-nova-ink">{shopPricing.priceLabel}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Open order form for ${item.id} ${item.name}`} onPress={() => { const product = products.find(p => p.id === item.id); if (product) pick(product); }} style={{ minHeight: 44, justifyContent: 'center', marginTop: 8 }}><Text className="text-[11px] font-bold text-nova-ink">အော်ဒါဖောင်ဖွင့်မယ် →</Text></Pressable></View>)}</ScrollView></View>;
}
// Validate only the response fields used by the client; never display raw error bodies.
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const isAdvisorProfile = (value: unknown): value is FragranceProfile => isRecord(value)
  && ['favoriteFamilies', 'preferredNotes', 'moods', 'occasions', 'dislikes'].every(key => isStringArray(value[key]))
  && ['lastRecommendation', 'updatedAt'].every(key => value[key] === undefined || typeof value[key] === 'string');
const isAdvisorRecommendation = (value: unknown): value is Recommendation => isRecord(value)
  && ['id', 'name', 'price'].every(key => typeof value[key] === 'string')
  && ['family', 'notes', 'matchedFamilies', 'matchedNotes', 'seasonalMatches'].every(key => isStringArray(value[key]))
  && typeof value.score === 'number' && typeof value.purchaseMatches === 'number' && typeof value.blocked === 'boolean';
const isAdvisorResponse = (value: unknown): value is { reply: string; profile?: FragranceProfile | null; recommendations?: Recommendation[] | null } => isRecord(value)
  && typeof value.reply === 'string' && Boolean(value.reply.trim())
  && (value.profile == null || isAdvisorProfile(value.profile))
  && (value.recommendations == null || (Array.isArray(value.recommendations) && value.recommendations.every(isAdvisorRecommendation)));

function Advisor({ pick }: { pick: (p: Product) => void }) {
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const [profile, setProfile] = useState<FragranceProfile>(emptyProfile); const [profileId, setProfileId] = useState(''); const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistory[]>([]);
  const [messages, setMessages] = useState<Message[]>([{ id: '1', from: 'nova', text: 'မင်္ဂလာပါ။ NOVA Scent Adviser ပါ။ သင်နှစ်သက်တဲ့ ရနံ့၊ သုံးမယ့်အချိန်နဲ့ စိတ်ခံစားချက်ကို ပြောပြပါ။ သင့်အတွက် လိုက်ဖက်တဲ့ ရေမွှေးကို အတူရွေးကြမယ်။' }, { id: '2', from: 'nova', text: 'ဥပမာ — လန်းဆန်းတဲ့ ရနံ့လိုချင်တယ်၊ ရုံးတက်ဖို့ ရွေးပေးပါ၊ ဒါမှမဟုတ် ပန်းရနံ့ ကြိုက်တယ်လို့ မေးနိုင်ပါတယ်။' }]);
  useEffect(() => { getProfileId().then(async id => { setProfileId(id); try { if (isCloudUser(id)) { const cloud = await loadCloudProfile(id); setProfile(cloud || emptyProfile); } else { setProfile(await loadGuestProfile(id)); } } catch {} }); }, []);
  useEffect(() => { if (isCloudUser(profileId)) loadCloudPurchases().then(setPurchaseHistory).catch(() => {}); }, [profileId]);
  const send = async () => {
    const text = input.trim();
    if (!text || loading || !profileId) return;
    const next = [...messages, { id: `${Date.now()}u`, from: 'user' as const, text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    const showNotice = (notice: string) => setMessages(current => [...current, { id: `${Date.now()}e`, from: 'nova', text: notice }]);
    try {
      let endpoint: string;
      try { endpoint = apiEndpoint('/api/scent-advisor'); }
      catch {
        showNotice('ရနံ့အကြံပေး API လိပ်စာ မသတ်မှတ်ရသေးပါ။ [API_CONFIG]');
        return;
      }
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, message: text, profile, purchaseHistory, history: messages.slice(-10) }),
        });
      } catch {
        showNotice('ရနံ့အကြံပေးနှင့် ချိတ်ဆက်မရပါ။ အင်တာနက်ချိတ်ဆက်မှုကို စစ်ပြီး ပြန်ကြိုးစားပါ။ [NETWORK]');
        return;
      }
      // HTTP status takes precedence even when a proxy returns HTML instead of JSON.
      if (!res.ok) {
        showNotice(`ရနံ့အကြံပေး ဆာဗာမှ တောင်းဆိုမှု မအောင်မြင်ပါ။ ခဏနေ ပြန်ကြိုးစားပါ။ [HTTP ${res.status}]`);
        return;
      }
      let body: string;
      try { body = await res.text(); }
      catch {
        showNotice('ရနံ့အကြံပေး၏ အဖြေကို လက်ခံစဉ် ချိတ်ဆက်မှု ပြတ်တောက်သွားပါသည်။ ပြန်ကြိုးစားပါ။ [NETWORK]');
        return;
      }
      let data: unknown;
      try { data = JSON.parse(body); }
      catch {
        showNotice('ရနံ့အကြံပေး ဆာဗာ၏ အဖြေသည် JSON ပုံစံ မမှန်ပါ။ ခဏနေ ပြန်ကြိုးစားပါ။ [INVALID_JSON]');
        return;
      }
      if (!isAdvisorResponse(data)) {
        showNotice('ရနံ့အကြံပေး ဆာဗာ၏ အဖြေပုံစံ မမှန်ပါ။ ခဏနေ ပြန်ကြိုးစားပါ။ [INVALID_RESPONSE]');
        return;
      }
      const nextProfile = data.profile || profile;
      const { reply, recommendations } = data;
      // Show a valid reply and retain this session's profile before attempting persistence.
      setProfile(nextProfile);
      setMessages(current => [...current, { id: `${Date.now()}n`, from: 'nova', text: reply, recommendations: recommendations || [] }]);
      if (isCloudUser(profileId)) {
        try { await saveCloudProfile(profileId, nextProfile); }
        catch { /* Do not discard a valid advisor reply on cloud sync failure. */ }
      } else {
        try { await AsyncStorage.setItem(guestProfileKey(profileId), JSON.stringify(nextProfile)); }
        catch {
          showNotice('အဖြေရရှိပါပြီ။ သို့သော် ရနံ့နှစ်သက်မှုကို ဤစက်တွင် မသိမ်းနိုင်ပါ။ နောက်တစ်ကြိမ် ဖွင့်လျှင် မမှတ်မိနိုင်ပါ။ [LOCAL_PROFILE_SAVE]');
        }
      }
    } finally { setLoading(false); }
  };
  return <SafeAreaView style={s.advisor}><View style={s.advisorHead}><View><Text style={s.eyebrow}>NOVA INTELLIGENCE</Text><Text style={s.heading}>Scent Adviser</Text></View><Text style={s.online}>{loading ? 'THINKING…' : 'NOVA AI'}</Text></View><ScrollView contentContainerStyle={s.chat}><ProfileMemory profile={profile} />{messages.map(m => <View key={m.id} style={[s.bubble, m.from === 'user' && s.userBubble]}><Text style={[s.bubbleText, m.from === 'user' && s.userText]}>{m.text}</Text>{m.recommendations?.length ? <RecommendationStrip items={m.recommendations} pick={pick} /> : null}</View>)}{loading && <View style={s.bubble}><Text style={s.bubbleText}>Learning your preferences…</Text></View>}</ScrollView><View style={s.composer}><TextInput value={input} onChangeText={setInput} accessibilityLabel="Message NOVA Scent Adviser" placeholder="ရနံ့အကြောင်း မေးလိုက်ပါ…" placeholderTextColor="#9C968D" style={s.input} onSubmitEditing={send} returnKeyType="send" editable={!loading}/><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={loading || !input.trim() || !profileId} onPress={send} style={s.send}><Text style={s.sendText}>↑</Text></Pressable></View></SafeAreaView>;
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
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(''); const [quantity, setQuantity] = useState('1');
  const [size, setSize] = useState<BottleSize | null>(null);
  const [sending, setSending] = useState(false); const sendingRef = useRef(false);
  const [orderStatus, setOrderStatus] = useState('');
  const [discountOffer, setDiscountOffer] = useState({ enabled: false, percent: 0 });
  const idempotencyKeyRef = useRef('');
  useEffect(() => {
    let active = true;
    (async () => { try { if (Platform.OS !== 'web' && !API_URL) return; const response = await fetch(apiEndpoint('/api/current-discount')); if (!response.ok) return; const setting = await response.json(); if (active && setting.enabled === true && Number.isFinite(Number(setting.percent))) setDiscountOffer({ enabled: true, percent: Math.max(0, Math.min(100, Number(setting.percent))) }); } catch { /* Keep the safe no-discount estimate if Preview settings are unavailable. */ } })();
    return () => { active = false; };
  }, []);
  const amount = Number(quantity);
  const validQuantity = Number.isInteger(amount) && amount >= 1 && amount <= 99;
  const unitPrice = size ? shopPricing.sizes[size] : null;
  const total = unitPrice !== null && validQuantity ? unitPrice * amount : null;
  const discountPercent = discountOffer.enabled ? discountOffer.percent : 0;
  const discountAmount = total === null ? null : Math.round(total * discountPercent / 100);
  const codTotal = total === null || discountAmount === null ? null : total - discountAmount;
  const submitOrder = async () => {
    if (sendingRef.current) return;
    setOrderStatus('');
    if (!size) { setOrderStatus('10ml သို့မဟုတ် 30ml ကို ရွေးပေးပါ။'); return; }
    if (!validQuantity) { setOrderStatus('အရေအတွက်ကို 1 မှ 99 အတွင်း ကိန်းပြည့် ဖြည့်ပေးပါ။'); return; }
    if (!name.trim() || !phone.trim() || !address.trim()) { setOrderStatus('အမည်၊ ဖုန်းနံပါတ်နဲ့ ပို့ရမယ့်လိပ်စာ ဖြည့်ပေးပါ။'); return; }
    sendingRef.current = true; setSending(true);
    try {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = `NOVA_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const res = await fetch(apiEndpoint('/api/order-notification'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: name.trim(), phone: phone.trim(), address: address.trim(), quantity: amount, size, paymentMethod: shopPricing.paymentMethod, idempotencyKey: idempotencyKeyRef.current, product: { id: p.id } }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        setOrderStatus(res.status === 503 ? 'အော်ဒါလက်ခံစနစ် မချိတ်ဆက်ရသေးပါ။ အော်ဒါ မပို့ရသေးပါ။' : 'အော်ဒါပို့မှုကို အတည်မပြုနိုင်သေးပါ။ ချက်ချင်း ထပ်မပို့ဘဲ ဆိုင်နှင့် အတည်ပြုပေးပါ။');
        return;
      }
      if (data.orderNumber) {
        const discountText = Number(data.discountAmount) > 0 ? ` Discount ${data.discountPercent}%: −${money(Number(data.discountAmount))}.` : '';
        const notificationText = data.notificationSent === false && !data.duplicate ? ' The order is saved in the Preview queue, but its Telegram notice was not sent.' : '';
        setOrderStatus(`Order ${data.orderNumber} received. Subtotal ${money(Number(data.subtotal))}.${discountText} COD merchandise total ${money(Number(data.total))}; delivery fee is separate.${notificationText}`);
      } else setOrderStatus('အော်ဒါတောင်းဆိုချက် ပို့ပြီးပါပြီ။ ပစ္စည်းရရှိမှုနဲ့ ပို့ခကို ဆိုင်က ဆက်သွယ်အတည်ပြုပေးပါမယ်။ COD — အိမ်ရောက်ငွေချေပါ။');
      idempotencyKeyRef.current = '';
      setName(''); setPhone(''); setAddress(''); setQuantity('1'); setSize(null);
    } catch {
      setOrderStatus('ပို့မှုအခြေအနေကို အတည်မပြုနိုင်သေးပါ။ ထပ်မပို့ခင် ဆိုင်နှင့် စစ်ဆေးပေးပါ။');
    } finally { sendingRef.current = false; setSending(false); }
  };
  const field = { backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#E6DDD3', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#102B62', fontSize: 13, marginTop: 9 } as const;
  return <SafeAreaView style={s.detail}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 35 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close order form" disabled={sending} onPress={close}><Text style={s.back}>‹ ပြန်သွားမယ် / ရေမွှေးပြောင်းရွေးမယ်</Text></Pressable>
    <View style={s.detailVisual}><Bottle p={p} /></View>
    <Text style={s.eyebrow}>{p.id} · {p.family.toUpperCase()}</Text><Text style={s.detailTitle}>{p.name}</Text>
    <Text style={s.detailNotes}>{p.notes}</Text><Text style={s.detailDescription}>{p.bioMyanmar || p.family}</Text>
    <Text style={s.detailMeta}>{p.category} · {p.brand} · Inspired by {p.originalReference}</Text>
    <Text style={{ color: '#946D25', fontSize: 13, fontWeight: '700', marginTop: 26 }}>အော်ဒါဖောင် · {p.id} — {p.name}</Text>
    <Text style={s.detailDescription}>ရေမွှေးအားလုံး {shopPricing.priceLabel} ပါ။</Text>
    <Text style={s.detailDescription}>အရွယ်အစား ရွေးပါ</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(Object.keys(shopPricing.sizes) as BottleSize[]).map(option => <Pressable key={option} disabled={sending} accessibilityRole="radio" accessibilityState={{ checked: size === option }} accessibilityLabel={`Choose ${option}`} onPress={() => setSize(option)} style={[field, { minHeight: 44, backgroundColor: size === option ? '#E8C977' : '#FFFDF9' }]}><Text>{option} — {money(shopPricing.sizes[option])}</Text></Pressable>)}
    </View>
    <TextInput accessibilityLabel="Quantity" editable={!sending} value={quantity} onChangeText={setQuantity} placeholder="အရေအတွက် (1–99)" keyboardType="number-pad" maxLength={3} style={field} />
    <TextInput accessibilityLabel="Customer name" editable={!sending} value={name} onChangeText={setName} placeholder="မှာယူသူအမည်" autoComplete="name" maxLength={500} style={field} />
    <TextInput accessibilityLabel="Phone number" editable={!sending} value={phone} onChangeText={setPhone} placeholder="ဆက်သွယ်ရန် ဖုန်းနံပါတ်" autoComplete="tel" keyboardType="phone-pad" maxLength={500} style={field} />
    <TextInput accessibilityLabel="Delivery address" editable={!sending} value={address} onChangeText={setAddress} placeholder="ပို့ပေးရမယ့် လိပ်စာအပြည့်အစုံ" autoComplete="street-address" maxLength={500} multiline style={[field, { minHeight: 70, textAlignVertical: 'top' }]} />
    <View style={[field, { marginTop: 16 }]}>
      <Text>{p.id} — {p.name}</Text>
      <Text style={{ marginTop: 8 }}>{size ? `${size} · ${money(unitPrice!)} × ${validQuantity ? amount : '—'}` : 'အရွယ်အစား ရွေးပေးပါ။'}</Text>
      <Text style={{ marginTop: 8 }}>ကုန်ပစ္စည်းစုစုပေါင်း: {total === null ? '—' : money(total)}</Text>
      {discountPercent > 0 && discountAmount !== null ? <Text style={{ marginTop: 6, color: '#355F3C' }}>လျှော့ဈေး ({discountPercent}%): −{money(discountAmount)}</Text> : null}
      <Text accessibilityLiveRegion="polite" style={{ color: '#102B62', fontSize: 17, fontWeight: '700', marginTop: 8 }}>COD ပစ္စည်းစုစုပေါင်း: {codTotal === null ? '—' : money(codTotal)}</Text>
      <Text style={{ marginTop: 8 }}>{shopPricing.paymentLabel}</Text>
      <Text style={{ marginTop: 8, lineHeight: 22 }}>ပို့ခ မပါသေးပါ။ ပစ္စည်းရရှိမှုနဲ့ ပို့ခကို ဆိုင်က ဆက်သွယ်အတည်ပြုပြီးမှ ပို့ပေးပါမယ်။</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Send COD order request" onPress={submitOrder} disabled={sending} style={[s.add, { marginTop: 16, alignItems: 'center', opacity: sending ? 0.6 : 1 }]}><Text style={s.addText}>{sending ? 'အော်ဒါပို့နေပါတယ်…' : 'COD အော်ဒါတောင်းဆိုချက် ပို့မယ် →'}</Text></Pressable>
    {orderStatus ? <Text accessibilityRole="alert" style={{ color: '#80583D', marginTop: 12, lineHeight: 22 }}>{orderStatus}</Text> : null}
  </ScrollView></SafeAreaView>;
}
function StorefrontApp() {
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
 if (booting) return <SafeAreaView style={s.auth}><StatusBar style="dark" /></SafeAreaView>; const screen = tab === 'home' ? <Home go={setTab} pick={setSelected} /> : tab === 'discover' ? <Discover pick={setSelected} /> : tab === 'advisor' ? <Advisor pick={setSelected} /> : !session ? <AuthScreen onAuth={setSession} /> : <Profile onSignOut={async () => { if (supabase) await supabase.auth.signOut(); await AsyncStorage.removeItem('@nova/local-session'); setTab('home'); setSelected(null); setSession(null); }} />; return <SafeAreaView style={s.app}><StatusBar style="dark" />{screen}<View style={s.nav}>{([['home', '⌂', 'Home'], ['discover', '◒', 'Discover'], ['advisor', '✦', 'Advisor'], ['profile', '○', 'Profile']] as const).map(([key, icon, label]) => <Pressable key={key} onPress={() => setTab(key)} style={s.navItem}><Text style={[s.navIcon, tab === key && s.navActive]}>{icon}</Text><Text style={[s.navLabel, tab === key && s.navActive]}>{label}</Text></Pressable>)}</View><Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => {}}>{selected ? <Detail key={selected.id} p={selected} close={() => setSelected(null)} /> : null}</Modal></SafeAreaView>; }

export default function App() {
  const isAdminRoute = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/admin';
  return <SafeAreaProvider>{isAdminRoute ? <AdminRoute /> : <StorefrontApp />}</SafeAreaProvider>;
}

const s = StyleSheet.create({
homePage: { paddingBottom: 24 },
notice: { backgroundColor: '#102B62', paddingHorizontal: 16, paddingVertical: 8, minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
noticeLabel: { color: '#E8C977', fontSize: 8, letterSpacing: 1.2, fontWeight: '800', flexShrink: 1 },
noticeCopy: { color: '#FFF9ED', fontSize: 10, lineHeight: 16, flex: 1 },
homeContent: { paddingHorizontal: 18 },
brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 12 },
brandLogo: { width: 112, height: 34 },
brandAccount: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
brandAccountText: { color: '#102B62', fontSize: 11, fontWeight: '700' },
hero: { minHeight: 224, backgroundColor: '#102B62', borderRadius: 20, padding: 18, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
heroCopyBlock: { flex: 1, zIndex: 1 },
heroKicker: { color: '#E8C977', fontSize: 8, letterSpacing: 1.4, fontWeight: '800' },
heroTitle: { color: '#FFF9ED', fontSize: 28, lineHeight: 31, fontWeight: '600', marginTop: 9, letterSpacing: -.4 },
heroCopy: { color: '#E3E7EF', fontSize: 11, lineHeight: 18, marginTop: 10, maxWidth: 190 },
heroImage: { width: '42%', maxWidth: 148, height: 168, marginRight: -12, marginLeft: -5 },
heroStack: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch' },
heroCopyStack: { width: '100%' },
heroImageStack: { width: '100%', maxWidth: 230, height: 150, alignSelf: 'center', marginTop: 4, marginRight: 0, marginLeft: 0 },
heroButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#E8C977', marginTop: 13 },
heroButtonText: { color: '#102B62', fontSize: 11, fontWeight: '800' },
adviserCard: { backgroundColor: '#F2E9DA', borderRadius: 18, padding: 15, minHeight: 174, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 26, borderWidth: 1, borderColor: '#E4D6C2' },
adviserWords: { flex: 1, paddingRight: 8 },
adviserKicker: { color: '#946D25', fontSize: 8, letterSpacing: 1.1, fontWeight: '800' },
adviserTitle: { color: '#102B62', fontSize: 19, lineHeight: 24, fontWeight: '700', marginTop: 6 },
adviserCopy: { color: '#665D55', fontSize: 11, lineHeight: 17, marginTop: 6 },
adviserChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
adviserChip: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, justifyContent: 'center', backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#D9C7AC' },
adviserChipText: { color: '#5D4C3E', fontSize: 10, fontWeight: '700' },
robotFrame: { width: 92, height: 122, borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden' },
robotImage: { width: '100%', height: '100%' },
adviserCardStack: { flexDirection: 'column', alignItems: 'stretch' },
adviserWordsStack: { width: '100%', paddingRight: 0 },
robotFrameStack: { width: '100%', height: 150, marginTop: 12 },
adviserCta: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: 8, paddingHorizontal: 2 },
adviserCtaText: { color: '#102B62', fontSize: 12, fontWeight: '800' },
sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
sectionTitle: { color: '#102B62', fontSize: 19, fontWeight: '700' },
sectionSub: { color: '#9B968E', fontSize: 11, marginTop: 4 },
seeAllButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
seeAll: { color: '#946D25', fontWeight: '800', fontSize: 11 },
rowList: { gap: 12, paddingBottom: 10 },
card: { width: 188, backgroundColor: '#FFFDF9', borderRadius: 16, overflow: 'hidden', marginRight: 0 },
productImage: { height: 158, backgroundColor: '#F0E9DE', justifyContent: 'center', alignItems: 'center', position: 'relative' },
cardTag: { position: 'absolute', top: 10, left: 10, fontSize: 8, color: '#946D25', fontWeight: '800', letterSpacing: .5 },
heart: { position: 'absolute', right: 10, top: 7, color: '#716A62', fontSize: 21 },
cardBody: { padding: 12 },
productName: { color: '#102B62', fontSize: 13, fontWeight: '700', flexShrink: 1, minWidth: 0 },
price: { color: '#946D25', fontWeight: '700', fontSize: 11, flexShrink: 1, width: '100%' },
family: { color: '#8D867D', fontSize: 10, marginTop: 4 },
notes: { color: '#B1AAA1', fontSize: 9, marginTop: 6 },
bottleWrapSmall: { height: 120 },
productPhotoSmall: { width: 125, height: 116, borderRadius: 10 },
capSmall: { width: 26, height: 23 },
bottleSmall: { width: 52, height: 78, borderRadius: 6 },
bottleMarkSmall: { fontSize: 20 },
app: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: '#FBF7EF' },
page: { padding: 24, paddingBottom: 110 },
top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
eyebrow: { fontSize: 10, letterSpacing: 2, color: '#946D25', fontWeight: '700' },
heading: { color: '#102B62', fontSize: 25, fontWeight: '500', marginTop: 6, letterSpacing: -1 },
avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#102B62', justifyContent: 'center', alignItems: 'center' },
avatarText: { color: '#E7C99D', fontSize: 18, fontWeight: '700' },
heroGlow: { position: 'absolute', right: -35, top: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: '#6E4934', opacity: .7 },
aiKicker: { color: '#D8B768', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
row: { flexDirection: 'row', justifyContent: 'space-between' },
productRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 },
bottleWrap: { alignItems: 'center', justifyContent: 'flex-end', height: 178 },
productPhoto: { width: 190, height: 178, borderRadius: 12 },
cap: { width: 39, height: 34, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: .95 },
bottle: { width: 75, height: 112, borderRadius: 7, justifyContent: 'center', alignItems: 'center', shadowColor: '#5A3E2C', shadowOpacity: .18, shadowRadius: 8, elevation: 4 },
shine: { position: 'absolute', left: 9, top: 10, width: 9, height: 78, borderRadius: 4, backgroundColor: '#FFF', opacity: .22 },
bottleMark: { color: '#6D4C3A', fontSize: 28, fontWeight: '300', fontFamily: 'serif' },
bottleWord: { color: '#6D4C3A', fontSize: 7, letterSpacing: 2, marginTop: 4 },
editCard: { backgroundColor: '#F0E7D4', borderRadius: 20, padding: 20, minHeight: 170, flexDirection: 'row', overflow: 'hidden' },
editTitle: { color: '#382B24', fontSize: 20, fontWeight: '600', marginTop: 8 },
editCopy: { color: '#7D6B5D', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 215 },
link: { color: '#93623D', fontSize: 12, fontWeight: '700', marginTop: 15 },
orb: { width: 85, height: 85, borderRadius: 43, backgroundColor: '#BE936D', alignItems: 'center', justifyContent: 'center', marginTop: 28, marginRight: -20 },
orbText: { color: '#FAE9CE', fontSize: 34 },
intro: { color: '#766F67', lineHeight: 20, fontSize: 14, marginBottom: 20 },
search: { fontSize: 28, color: '#7E756D' },
filters: { gap: 8, paddingBottom: 25 },
filter: { paddingVertical: 9, paddingHorizontal: 17, borderRadius: 18, borderWidth: 1, borderColor: '#E2DCD2' },
filterOn: { backgroundColor: '#102B62', borderColor: '#102B62' },
filterText: { color: '#9B948B', fontSize: 12 },
filterTextOn: { color: '#F7EEE3', fontWeight: '700' },
grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
gridSingle: { justifyContent: 'flex-start' },
advisor: { flex: 1, backgroundColor: '#FBF7EF' },
advisorHead: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
online: { color: '#6D8B6F', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
chat: { padding: 24, paddingTop: 10, gap: 13, paddingBottom: 30 },
bubble: { backgroundColor: '#F2EBDD', padding: 15, borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '88%' },
userBubble: { backgroundColor: '#102B62', alignSelf: 'flex-end', borderBottomLeftRadius: 18, borderBottomRightRadius: 4 },
bubbleText: { color: '#263D67', fontSize: 14, lineHeight: 21 },
userText: { color: '#F7EEE3' },
composer: { flexDirection: 'row', padding: 14, borderTopWidth: 1, borderTopColor: '#E6E0D7', backgroundColor: '#FFFCF7', alignItems: 'center' },
input: { flex: 1, paddingHorizontal: 15, paddingVertical: 12, color: '#102B62', backgroundColor: '#F3EEE7', borderRadius: 24, fontSize: 13 },
send: { width: 43, height: 43, borderRadius: 22, marginLeft: 8, backgroundColor: '#946D25', alignItems: 'center', justifyContent: 'center' },
sendText: { color: 'white', fontSize: 22 },
memoryCard: { backgroundColor: '#F0E7D4', borderRadius: 18, padding: 16, marginBottom: 14 },
memoryTitleRow: { flexDirection: 'row', justifyContent: 'space-between' },
memoryTitle: { color: '#102B62', fontSize: 15, fontWeight: '700' },
memorySpark: { color: '#946D25', fontSize: 18 },
memoryCopy: { color: '#796B60', fontSize: 12, lineHeight: 18, marginTop: 6 },
chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
chip: { backgroundColor: '#F8F1E8', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
chipText: { color: '#8E6445', fontSize: 10, fontWeight: '600' },
memoryMeta: { color: '#967457', fontSize: 11, marginTop: 9 },
profileMemory: { backgroundColor: '#102B62', borderRadius: 20, padding: 20, marginBottom: 20 },
profileMemoryKicker: { color: '#D8B768', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
profileMemoryTitle: { color: '#FFF9F1', fontSize: 22, fontWeight: '500', marginTop: 10 },
profileMemoryCopy: { color: '#C5BDB4', fontSize: 12, lineHeight: 18, marginTop: 8 },
profileRow: { backgroundColor: '#FFFDF9', borderBottomWidth: 1, borderBottomColor: '#F0ECE6', padding: 15 },
profileRowLabel: { color: '#8E867E', fontSize: 11 },
profileRowValue: { color: '#3F3831', fontSize: 13, marginTop: 5 },
auth: { flex: 1, backgroundColor: '#FBF7EF' },
authContent: { padding: 28, alignItems: 'center', paddingTop: 56 },
authLogo: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#102B62', alignItems: 'center', justifyContent: 'center' },
authLogoText: { color: '#E7C99D', fontSize: 28, fontWeight: '700' },
authBrand: { color: '#102B62', fontSize: 19, letterSpacing: 6, fontWeight: '700', marginTop: 15 },
authTagline: { color: '#946D25', fontSize: 13, marginTop: 8, textAlign: 'center' },
authPanel: { alignSelf: 'stretch', backgroundColor: '#FFFDF9', borderRadius: 22, padding: 22, marginTop: 38 },
authTitle: { color: '#102B62', fontSize: 24, fontWeight: '600' },
authSub: { color: '#958C83', fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 20 },
authInput: { backgroundColor: '#F3EEE7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: '#102B62', fontSize: 13, marginBottom: 10 },
authButton: { backgroundColor: '#102B62', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
authButtonText: { color: '#F7EEE3', fontSize: 13, fontWeight: '700' },
authSwitch: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
authSwitchText: { color: '#958C83', fontSize: 12 },
authLink: { color: '#946D25', fontSize: 12, fontWeight: '700' },
guestLink: { color: '#946D25', fontSize: 13, fontWeight: '700', marginTop: 25 },
authError: { color: '#A35F4B', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16 },
localNote: { color: '#B3ABA2', fontSize: 10, marginTop: 14, textAlign: 'center' },
profileTop: { alignItems: 'center', paddingVertical: 35 },
largeAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#102B62', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
largeAvatarText: { color: '#E7C99D', fontSize: 34, fontWeight: '700' },
profileName: { fontSize: 20, color: '#102B62', fontWeight: '600' },
profileSub: { color: '#9C958C', marginTop: 7 },
menu: { backgroundColor: '#FFFDF9', padding: 19, borderBottomWidth: 1, borderBottomColor: '#F0ECE6', flexDirection: 'row', justifyContent: 'space-between' },
menuText: { color: '#4D4640', fontSize: 14 },
chevron: { color: '#B4ACA2', fontSize: 22 },
nav: { flexShrink: 0, minHeight: 76, backgroundColor: '#FFFCF7', borderTopWidth: 1, borderTopColor: '#EEE8DF', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 11, paddingBottom: 8 },
navItem: { alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 52, flex: 1, paddingHorizontal: 3 },
navIcon: { color: '#B5ADA3', fontSize: 22, height: 28 },
navLabel: { color: '#A7A097', fontSize: 10, marginTop: 3, textAlign: 'center', flexShrink: 1 },
navActive: { color: '#946D25', fontWeight: '700' },
pressed: { opacity: .78 },
detail: { flex: 1, padding: 24, backgroundColor: '#FBF7EF' },
back: { color: '#8F694A', fontSize: 14, marginBottom: 15 },
detailVisual: { height: 340, backgroundColor: '#EDE3D5', borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 25 },
detailTitle: { fontSize: 32, color: '#102B62', fontWeight: '500', marginTop: 8 },
detailNotes: { color: '#946D25', fontSize: 14, marginTop: 8 },
detailDescription: { color: '#7F776E', fontSize: 14, lineHeight: 22, marginTop: 23, maxWidth: 320 },
detailMeta: { color: '#946D25', fontSize: 11, lineHeight: 17, marginTop: 12, maxWidth: 320 },
detailBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 35 },
detailPrice: { color: '#102B62', fontSize: 24, fontWeight: '600' },
add: { backgroundColor: '#102B62', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 21 },
addText: { color: '#F7EEE3', fontWeight: '700', fontSize: 12 }
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { novaCatalog } from './data/nova-catalog';
import { buildAddressLabelHtml, buildReceiptHtml } from './lib/print-templates.mjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import shopPricing from './data/shop-pricing.json';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
const endpoint = (path: string) => {
  if (Platform.OS !== 'web' && !API_URL) throw new Error('Set EXPO_PUBLIC_API_URL to your Preview API address.');
  return `${API_URL}${path}`;
};

type OrderItem = { product_id: string; product_name: string; size: string; unit_price: number; quantity: number; line_total: number };
type Order = { id: string; order_number: string; status: string; customer_name: string; phone: string; address: string; payment_method: string; subtotal: number; discount_percent: number; discount_amount: number; total: number; created_at: string; nova_order_items?: OrderItem[]; nova_order_status_history?: any[] };
type Inventory = { product_id: string; stock_units: number | null; stock_ml: number | null; updated_at: string };
type InventoryAdjustment = { product_id: string; metric: Metric; delta: number; previous_value: number | null; new_value: number; reason: string; actor_email: string; created_at: string };
type Metric = 'units' | 'ml';
type DiscountSetting = { enabled: boolean; percent: number; updated_by?: string; updated_at?: string };
const money = (value: number) => `${Number(value || 0).toLocaleString('en-US')} Ks`;
const statusLabel: Record<string, string> = { waiting: 'စောင့်ဆိုင်း · Waiting', confirmed: 'အတည်ပြုပြီး · Confirmed', packing: 'ထုပ်ပိုးနေ · Packing', delivery: 'ပို့ဆောင်နေ · Delivery', cancelled: 'ပယ်ဖျက်ပြီး · Cancelled' };
const nextStatus: Record<string, string | null> = { waiting: 'confirmed', confirmed: 'packing', packing: 'delivery', delivery: null, cancelled: null };

function PrintButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.smallButton, disabled && { opacity: 0.5 }]}><Text style={styles.smallButtonText}>{title}</Text></Pressable>;
}

export default function AdminConsole({ onSignOut, authClient }: { onSignOut: () => void; authClient: SupabaseClient | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [discountSetting, setDiscountSetting] = useState<DiscountSetting>({ enabled: false, percent: 0 });
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [section, setSection] = useState<'orders' | 'stock' | 'discount' | 'showcase'>('orders');
  const [showcaseTitle, setShowcaseTitle] = useState('');
  const [showcaseDescription, setShowcaseDescription] = useState('');
  const [showcaseImage, setShowcaseImage] = useState('');
  const [showcaseCta, setShowcaseCta] = useState<'discover' | 'advisor'>('discover');
  const [showcaseEnabled, setShowcaseEnabled] = useState(false);
  const [width, setWidth] = useState<80 | 110>(80);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [metric, setMetric] = useState<Record<string, Metric>>({});
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [preparingThermer, setPreparingThermer] = useState('');
  const [thermerLink, setThermerLink] = useState<{ orderId: string; href: string; expiresAt: number } | null>(null);

  useEffect(() => {
    if (!thermerLink) return;
    const timer = setTimeout(() => setThermerLink(null), Math.max(0, thermerLink.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [thermerLink]);

  const api = useCallback(async (path: string, method = 'GET', body?: any) => {
    const sessionResult = await authClient?.auth.getSession();
    const token = sessionResult?.data.session?.access_token;
    if (!token) throw new Error('Please sign in with an authorized NOVA staff account.');
    const response = await fetch(endpoint(path), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }, [authClient]);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [orderData, stockData, discountData] = await Promise.all([api('/api/admin/orders'), api('/api/admin/inventory'), api('/api/admin/discount')]);
      setOrders(orderData.orders || []);
      try {
        const showcase = await api('/api/admin/showcase');
        const board = showcase.board;
        if (board) { setShowcaseTitle(board.title || ''); setShowcaseDescription(board.description || ''); setShowcaseImage(board.image_url || ''); setShowcaseCta(board.cta || 'discover'); setShowcaseEnabled(Boolean(board.enabled)); }
      } catch { /* Display board may not be initialized yet. */ }
      setInventory(stockData.inventory || []);
      setAdjustments(stockData.adjustments || []);
      const setting = discountData.setting || { enabled: false, percent: 0 };
      setDiscountSetting(setting); setDiscountEnabled(Boolean(setting.enabled)); setDiscountPercent(String(setting.percent ?? 0));
    } catch (problem: any) { setError(problem?.message || 'Could not load Preview administration data.'); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { refresh(); }, [refresh]);

  const inventoryByProduct = useMemo(() => new Map(inventory.map(item => [item.product_id, item])), [inventory]);
  const products = useMemo(() => novaCatalog.map(product => ({ id: product.id, name: product.name, family: product.familyLabel })), []);
  const updateStatus = async (order: Order, status: string) => {
    setWorking(order.id); setError(''); setNotice('');
    try { await api('/api/admin/orders', 'POST', { action: 'status', orderId: order.id, status }); setNotice(`${order.order_number} → ${statusLabel[status] || status}`); await refresh(); }
    catch (problem: any) { setError(problem?.message || 'Status update failed.'); }
    finally { setWorking(''); }
  };
  const adjust = async (productId: string, sign: 1 | -1) => {
    const selectedMetric = metric[productId] || 'units';
    const value = Number(amount[productId] || '1');
    const why = (reason[productId] || '').trim();
    if (!Number.isFinite(value) || value <= 0 || (selectedMetric === 'units' && !Number.isInteger(value))) { setError(selectedMetric === 'units' ? 'Units must be a positive whole number.' : 'Enter a positive milliliter amount.'); return; }
    if (!why) { setError('Add a reason before changing inventory; every adjustment is recorded.'); return; }
    setWorking(productId); setError(''); setNotice('');
    try {
      await api('/api/admin/inventory', 'POST', { action: 'adjust', productId, metric: selectedMetric, delta: sign * value, reason: why });
      setNotice(`${productId}: ${sign > 0 ? '+' : '−'}${value} ${selectedMetric === 'ml' ? 'ml' : 'units'} saved.`);
      await refresh();
    } catch (problem: any) { setError(problem?.message || 'Inventory adjustment failed.'); }
    finally { setWorking(''); }
  };
  const saveDiscount = async () => {
    const value = Number(discountPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100 || (discountPercent.split('.')[1]?.length || 0) > 2) { setError('Discount must be between 0% and 100%, with up to two decimal places.'); return; }
    setWorking('discount'); setError(''); setNotice('');
    try { const data = await api('/api/admin/discount', 'POST', { action: 'update', enabled: discountEnabled, percent: value }); setDiscountSetting(data.setting); setNotice(data.setting.enabled ? `Discount enabled at ${data.setting.percent}%. New COD orders will snapshot this rate.` : 'Discount disabled. New orders will use the original size prices.'); await refresh(); }
    catch (problem: any) { setError(problem?.message || 'Discount settings were not saved.'); }
    finally { setWorking(''); }
  };
  const saveShowcase = async () => {
    setWorking('showcase'); setError(''); setNotice('');
    try {
      await api('/api/admin/showcase', 'POST', { action: 'save', title: showcaseTitle, description: showcaseDescription, image_url: showcaseImage, cta: showcaseCta, enabled: showcaseEnabled });
      setNotice('Live Showcase saved. Customer screens refresh within 30 seconds.');
    } catch (problem: any) { setError(problem?.message || 'Could not save showcase.'); }
    finally { setWorking(''); }
  };
  const print = (order: Order, kind: 'receipt' | 'label') => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') { setError('Printing is available in the web Preview.'); return; }
    const popup = window.open('', '_blank', 'width=600,height=800');
    if (!popup) { setError('Allow pop-ups for this Preview to open the print page.'); return; }
    const html = kind === 'receipt' ? buildReceiptHtml(order, width) : buildAddressLabelHtml(order, width);
    popup.document.open(); popup.document.write(html); popup.document.close();
  };
  const prepareThermer = async (order: Order) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') { setError('Thermer printing is available in the iPhone web Preview.'); return; }
    setError(''); setNotice(''); setThermerLink(null); setPreparingThermer(order.id);
    try {
      const data = await api('/api/admin/print-ticket', 'POST', { orderId: order.id });
      const expiresAt = Date.parse(data.expiresAt);
      if (typeof data.token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.token) || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || data.paperWidth !== 80) throw new Error('The Preview server returned an invalid print link.');
      const responseUrl = new URL(data.responseUrl);
      if (responseUrl.protocol !== 'https:' || responseUrl.origin === window.location.origin || responseUrl.pathname !== '/api/receipt' || responseUrl.username || responseUrl.password || responseUrl.hash || responseUrl.searchParams.getAll('token').length !== 1 || responseUrl.searchParams.get('token') !== data.token || [...responseUrl.searchParams.keys()].some(key => key !== 'token')) throw new Error('The Preview server returned an invalid relay link.');
      setThermerLink({ orderId: order.id, href: `bprint://${responseUrl.href}`, expiresAt });
      setNotice(`${order.order_number}: tap Open Thermer within 2 minutes. Browser Print must be enabled in the app; select 80mm paper. Nothing has been printed yet.`);
    } catch (problem: any) { setError(problem?.message || 'Could not prepare the Thermer receipt.'); }
    finally { setPreparingThermer(''); }
  };
  const openThermer = (orderId: string) => {
    if (!thermerLink || thermerLink.orderId !== orderId || thermerLink.expiresAt <= Date.now()) { setThermerLink(null); setError('The print link expired. Prepare a new Thermer link.'); return; }
    const href = thermerLink.href;
    setThermerLink(null); setNotice('Opening Thermer. Check the app and printer output; this page cannot confirm that printing succeeded.');
    // Synchronous second tap preserves iOS user activation; never launch after an awaited fetch.
    window.location.assign(href);
  };

  return <SafeAreaView style={styles.root}><View style={styles.header}><View><Text style={styles.kicker}>NOVA · PRIVATE PREVIEW</Text><Text style={styles.title}>Shop admin</Text></View><Pressable onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable></View>
    <View style={styles.tabs}><Pressable onPress={() => setSection('orders')} style={[styles.tab, section === 'orders' && styles.tabOn]}><Text style={[styles.tabText, section === 'orders' && styles.tabTextOn]}>Orders</Text></Pressable><Pressable onPress={() => setSection('stock')} style={[styles.tab, section === 'stock' && styles.tabOn]}><Text style={[styles.tabText, section === 'stock' && styles.tabTextOn]}>Stock / ml</Text></Pressable><Pressable onPress={() => setSection('discount')} style={[styles.tab, section === 'discount' && styles.tabOn]}><Text style={[styles.tabText, section === 'discount' && styles.tabTextOn]}>Discount</Text></Pressable><Pressable onPress={() => setSection('showcase')} style={[styles.tab, section === 'showcase' && styles.tabOn]}><Text style={[styles.tabText, section === 'showcase' && styles.tabTextOn]}>Live Board</Text></Pressable></View>
    {section === 'orders' ? <View style={styles.toolbar}><Text style={styles.help}>Browser print width</Text>{([80, 110] as const).map(value => <Pressable key={value} onPress={() => setWidth(value)} style={[styles.widthButton, width === value && styles.widthOn]}><Text style={[styles.widthText, width === value && styles.widthTextOn]}>{value} mm</Text></Pressable>)}</View> : null}
    {loading ? <Text style={styles.message}>Loading Preview data…</Text> : <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {section === 'showcase' ? <View style={{ gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16 }}>
        <Text style={styles.sectionTitle}>Home Live Display Board</Text>
        <Text style={styles.help}>Publish updates to the Preview home screen (refreshes within 30 seconds).</Text>
        <Text>Title</Text><TextInput style={{ borderWidth: 1, borderColor: '#DCD6CA', borderRadius: 9, padding: 11, color: '#102856' }} value={showcaseTitle} onChangeText={setShowcaseTitle} maxLength={90} placeholder="New at NOVA" />
        <Text>Description</Text><TextInput style={{ borderWidth: 1, borderColor: '#DCD6CA', borderRadius: 9, padding: 11, color: '#102856' }} value={showcaseDescription} onChangeText={setShowcaseDescription} multiline maxLength={500} placeholder="Describe the collection" />
        <Text>Image HTTPS URL (optional — use a real NOVA product photo)</Text><TextInput style={{ borderWidth: 1, borderColor: '#DCD6CA', borderRadius: 9, padding: 11, color: '#102856' }} value={showcaseImage} onChangeText={setShowcaseImage} autoCapitalize="none" placeholder="https://..." />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}><PrintButton title={showcaseCta === 'discover' ? '✓ Explore Scents' : 'Explore Scents'} onPress={() => setShowcaseCta('discover')} /><PrintButton title={showcaseCta === 'advisor' ? '✓ Ask Adviser' : 'Ask Adviser'} onPress={() => setShowcaseCta('advisor')} /></View>
        <View style={{ flexDirection: 'row', gap: 10 }}><PrintButton title={showcaseEnabled ? '✓ Published' : 'Publish board'} onPress={() => setShowcaseEnabled(true)} /><PrintButton title={!showcaseEnabled ? '✓ Hidden' : 'Hide board'} onPress={() => setShowcaseEnabled(false)} /></View>
        <PrintButton title={working === 'showcase' ? 'Saving...' : 'Save Live Board'} disabled={working === 'showcase'} onPress={saveShowcase} />
      </View> : null}
      {section === 'orders' ? <>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Order queue</Text><Pressable onPress={refresh}><Text style={styles.refresh}>Refresh</Text></Pressable></View>
        <Text style={styles.helpBlock}>Thermer 80mm prepares a short-lived receipt link, then Open Thermer launches the iPhone app. Receipt and Address label keep the browser print fallback.</Text>
        {orders.length === 0 ? <Text style={styles.empty}>No Preview orders yet. Use fake details only while testing.</Text> : orders.map(order => <View key={order.id} style={styles.card}>
          <View style={styles.cardTop}><Text testID={`order-${order.id}`} style={styles.orderNumber}>{order.order_number}</Text><Text style={[styles.status, order.status === 'cancelled' && styles.cancelStatus]}>{statusLabel[order.status] || order.status}</Text></View>
          <Text style={styles.customer}>{order.customer_name} · {order.phone}</Text><Text style={styles.detail}>{order.address}</Text>
          {(order.nova_order_items || []).map((item, index) => <Text key={`${order.id}-${index}`} style={styles.item}>{item.product_name} ({item.product_id}) · {item.size} × {item.quantity} · {money(item.unit_price)} each</Text>)}
          <Text style={styles.totalLine}>Subtotal: {money(order.subtotal)}</Text>{order.discount_percent > 0 ? <Text style={styles.discountLine}>Discount ({order.discount_percent}%): −{money(order.discount_amount)}</Text> : null}<Text style={styles.totalLine}>COD merchandise total: {money(order.total)}</Text><Text style={styles.timestamp}>Delivery fee not included; confirm separately.</Text>
          <Text style={styles.timestamp}>{new Date(order.created_at).toLocaleString()}</Text>
          <View style={styles.actionRow}>{nextStatus[order.status] ? <PrintButton title={nextStatus[order.status] === 'confirmed' ? 'Confirm' : nextStatus[order.status] === 'packing' ? 'Packing' : 'Delivery'} onPress={() => updateStatus(order, nextStatus[order.status] as string)} /> : null}{!['delivery', 'cancelled'].includes(order.status) ? <PrintButton title="Cancel" onPress={() => updateStatus(order, 'cancelled')} /> : null}<PrintButton title="Receipt" onPress={() => print(order, 'receipt')} /><PrintButton title="Address label" onPress={() => print(order, 'label')} /><PrintButton title={preparingThermer === order.id ? 'Preparing…' : 'Thermer 80mm'} disabled={Boolean(preparingThermer)} onPress={() => prepareThermer(order)} />{thermerLink?.orderId === order.id ? <PrintButton title="Open Thermer" onPress={() => openThermer(order.id)} /> : null}</View>
          {(order.nova_order_status_history || []).length ? <Text style={styles.timestamp}>History: {(order.nova_order_status_history || []).map(event => statusLabel[event.to_status] || event.to_status).join(' → ')}</Text> : null}
        </View>)}
      </> : section === 'stock' ? <>
        <Text style={styles.sectionTitle}>Manual stock and ml</Text><Text style={styles.helpBlock}>Balances are separate and are not changed automatically when an order is placed. Every +/− adjustment needs a reason and is recorded.</Text>
        <Text style={styles.historyHeading}>Recent adjustment history</Text>{adjustments.length ? adjustments.slice(0, 12).map(entry => <View key={`${entry.product_id}-${entry.created_at}`} style={styles.historyRow}><Text style={styles.historyText}>{entry.product_id} · {entry.delta > 0 ? '+' : ''}{entry.delta} {entry.metric === 'ml' ? 'ml' : 'units'} · {entry.previous_value == null ? 'new' : entry.previous_value} → {entry.new_value}</Text><Text style={styles.timestamp}>{entry.reason} · {entry.actor_email} · {new Date(entry.created_at).toLocaleString()}</Text></View>) : <Text style={styles.timestamp}>No adjustments recorded yet.</Text>}
        {products.map(product => { const row = inventoryByProduct.get(product.id); const selectedMetric = metric[product.id] || 'units'; const current = selectedMetric === 'ml' ? row?.stock_ml : row?.stock_units; return <View key={product.id} style={styles.stockCard}>
          <View style={styles.cardTop}><Text style={styles.orderNumber}>{product.id}</Text><Text style={styles.stockValue}>{current == null ? 'Not set' : `${current} ${selectedMetric === 'ml' ? 'ml' : 'units'}`}</Text></View><Text style={styles.customer}>{product.name}</Text>
          <View style={styles.metricRow}><Pressable onPress={() => setMetric(old => ({ ...old, [product.id]: 'units' }))} style={[styles.metricButton, selectedMetric === 'units' && styles.metricOn]}><Text style={styles.metricText}>Units</Text></Pressable><Pressable onPress={() => setMetric(old => ({ ...old, [product.id]: 'ml' }))} style={[styles.metricButton, selectedMetric === 'ml' && styles.metricOn]}><Text style={styles.metricText}>Milliliters</Text></Pressable><TextInput value={amount[product.id] ?? '1'} onChangeText={value => setAmount(old => ({ ...old, [product.id]: value }))} keyboardType="decimal-pad" placeholder="Amount" style={styles.amountInput} accessibilityLabel={`${product.id} adjustment amount`} /></View>
          <TextInput value={reason[product.id] || ''} onChangeText={value => setReason(old => ({ ...old, [product.id]: value }))} placeholder="Reason (e.g. stock count / received / used)" style={styles.reasonInput} />
          <View style={styles.actionRow}><PrintButton title={`− ${amount[product.id] || '1'}`} onPress={() => adjust(product.id, -1)} /><PrintButton title={`+ ${amount[product.id] || '1'}`} onPress={() => adjust(product.id, 1)} />{working === product.id ? <Text style={styles.timestamp}>Saving…</Text> : null}</View>
        </View>; })}
      </> : <>
        <Text style={styles.sectionTitle}>Shop-wide discount</Text><Text style={styles.helpBlock}>Reversible setting for new orders only. Base prices stay fixed at {money(shopPricing.sizes['10ml'])} / 10ml and {money(shopPricing.sizes['30ml'])} / 30ml. The percentage applies to the merchandise subtotal; delivery is excluded. Existing orders and receipts keep their saved snapshot.</Text>
        <View style={styles.discountCard}><Text style={styles.discountStatus}>Current saved setting: {discountSetting.enabled ? `${discountSetting.percent}% enabled` : `disabled (${discountSetting.percent}% saved)`}</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: discountEnabled }} onPress={() => setDiscountEnabled(value => !value)} style={[styles.toggle, discountEnabled && styles.toggleOn]}><Text style={styles.toggleText}>{discountEnabled ? 'Discount ON · tap to turn off' : 'Discount OFF · tap to enable'}</Text></Pressable><View style={styles.discountInputRow}><Text style={styles.help}>Discount percent</Text><TextInput value={discountPercent} onChangeText={setDiscountPercent} keyboardType="decimal-pad" maxLength={6} accessibilityLabel="Discount percent" style={styles.discountInput}/><Text style={styles.help}>%</Text></View><Text style={styles.timestamp}>At this rate: 10ml would be {money(Math.round(shopPricing.sizes['10ml'] * (1 - Number(discountPercent || 0) / 100)))}; 30ml would be {money(Math.round(shopPricing.sizes['30ml'] * (1 - Number(discountPercent || 0) / 100)))}. Final totals are calculated and saved by the server when an order is received.</Text><Pressable disabled={working === 'discount'} onPress={saveDiscount} style={styles.saveButton}><Text style={styles.saveButtonText}>{working === 'discount' ? 'Saving…' : 'Save discount setting'}</Text></Pressable><Text style={styles.timestamp}>Initial default is disabled at 0%. Turn it off any time; saved orders are not repriced.</Text></View>
      </>}
    </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: '#FBF7EF' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: '#946D25', fontSize: 9, letterSpacing: 1.4, fontWeight: '700' }, title: { color: '#102B62', fontSize: 26, fontWeight: '700', marginTop: 4 },
  signOut: { borderWidth: 1, borderColor: '#D6C7AE', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }, signOutText: { color: '#102B62', fontSize: 12, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E6DDD3', paddingHorizontal: 20 }, tab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabOn: { borderBottomColor: '#946D25' }, tabText: { color: '#7D766D', fontSize: 13 }, tabTextOn: { color: '#102B62', fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10 }, help: { color: '#746B60', fontSize: 11, marginRight: 3 }, widthButton: { borderWidth: 1, borderColor: '#D7CDBE', borderRadius: 9, paddingVertical: 6, paddingHorizontal: 10 }, widthOn: { backgroundColor: '#102B62', borderColor: '#102B62' }, widthText: { color: '#5C544B', fontSize: 11 }, widthTextOn: { color: '#FFFDF9', fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 44 }, message: { color: '#6E665D', padding: 20 }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, sectionTitle: { color: '#102B62', fontSize: 19, fontWeight: '700', marginBottom: 10 }, refresh: { color: '#946D25', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#FFFDF9', borderColor: '#E8DED1', borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 12 }, stockCard: { backgroundColor: '#FFFDF9', borderColor: '#E8DED1', borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 8 }, cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, orderNumber: { color: '#102B62', fontSize: 14, fontWeight: '800', flexShrink: 1 }, status: { color: '#946D25', fontSize: 11, fontWeight: '700', textAlign: 'right' }, cancelStatus: { color: '#A35F4B' }, customer: { color: '#332F2A', fontSize: 13, fontWeight: '700', marginTop: 9 }, detail: { color: '#5D5750', fontSize: 12, lineHeight: 18, marginTop: 4 }, item: { color: '#102B62', fontSize: 12, lineHeight: 18, marginTop: 8 }, timestamp: { color: '#93897E', fontSize: 10, marginTop: 7 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 12 }, smallButton: { backgroundColor: '#F0E7D4', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 }, smallButtonText: { color: '#102B62', fontSize: 11, fontWeight: '700' }, empty: { color: '#7D766D', backgroundColor: '#FFFDF9', padding: 15, borderRadius: 12, lineHeight: 20 }, error: { color: '#9E3F35', backgroundColor: '#FFF0ED', borderRadius: 10, padding: 11, marginBottom: 9, fontSize: 12 }, notice: { color: '#355F3C', backgroundColor: '#EAF4E9', borderRadius: 10, padding: 11, marginBottom: 9, fontSize: 12 },
  helpBlock: { color: '#746B60', fontSize: 12, lineHeight: 19, marginBottom: 7 }, historyHeading: { color: '#102B62', fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 }, historyRow: { borderLeftWidth: 2, borderLeftColor: '#C6A352', paddingLeft: 8, marginBottom: 8 }, historyText: { color: '#514A42', fontSize: 11, fontWeight: '700' }, stockValue: { color: '#946D25', fontSize: 12, fontWeight: '700' }, metricRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }, metricButton: { borderWidth: 1, borderColor: '#D7CDBE', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 }, metricOn: { backgroundColor: '#F0E7D4' }, metricText: { color: '#514A42', fontSize: 10, fontWeight: '700' }, amountInput: { flex: 1, minWidth: 52, borderWidth: 1, borderColor: '#E0D8CC', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, color: '#102B62', fontSize: 12 }, reasonInput: { borderWidth: 1, borderColor: '#E0D8CC', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, color: '#102B62', fontSize: 11, marginTop: 8 },
  totalLine: { color: '#102B62', fontSize: 12, fontWeight: '700', marginTop: 5 }, discountLine: { color: '#355F3C', fontSize: 12, fontWeight: '700', marginTop: 4 }, discountCard: { backgroundColor: '#FFFDF9', borderColor: '#E8DED1', borderWidth: 1, borderRadius: 15, padding: 16, marginTop: 8 }, discountStatus: { color: '#102B62', fontSize: 14, fontWeight: '700' }, toggle: { marginTop: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: '#EEE8DF' }, toggleOn: { backgroundColor: '#DDEBD9' }, toggleText: { color: '#102B62', fontSize: 12, fontWeight: '700' }, discountInputRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 }, discountInput: { width: 96, borderWidth: 1, borderColor: '#D7CDBE', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, color: '#102B62', fontSize: 15, textAlign: 'right' }, saveButton: { backgroundColor: '#102B62', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 12 }, saveButtonText: { color: '#FFFDF9', fontSize: 12, fontWeight: '700' },
});

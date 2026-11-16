import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { novaCatalog } from './data/nova-catalog';
import { myanmarDay } from './lib/manual-stock.mjs';

type Api = (path: string, method?: string, body?: any) => Promise<any>;
type Variant = { product_id: string; size: string; quantity: number };
type Movement = { id: number; product_id: string; size: string; delta: number; balance_before: number; balance_after: number; reason: string; order_number: string | null; actor_email: string; created_at: string };
type Balance = { product_id: string; size: string; opening: number | null; closing: number | null; stock_in: number; stock_out: number };
type DayOrder = { id: string; order_number: string; customer_name: string; status: string; total: number; items: { product_id: string; product_name: string; size: string; quantity: number }[] };
type Report = { date: string; generated_at: string; balances: Balance[]; movements: Movement[]; orders: DayOrder[]; order_count: number; cancelled_count: number; merchandise_total: number };
const names = new Map<string, string>(novaCatalog.map(p => [p.id, p.name]));
const money = (n: number) => `${Number(n).toLocaleString('en-US')} Ks`;
const time = (s: string) => new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' });
const statuses: Record<string, string> = { waiting: 'စောင့်ဆိုင်း', confirmed: 'အတည်ပြုပြီး', packing: 'ထုပ်ပိုးနေ', delivery: 'ပို့ဆောင်နေ', cancelled: 'ပယ်ဖျက်ပြီး' };
function Button({ title, onPress, active = false, disabled = false }: { title: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress} style={[s.button, active && s.active, disabled && { opacity: 0.45 }]}><Text style={[s.buttonText, active && s.activeText]}>{title}</Text></Pressable>;
}
function stockLabel(q: number | undefined | null) { return q == null ? 'စာရင်းမသွင်းရသေး' : q === 0 ? 'ကုန်ပြီ' : q <= 10 ? 'Low Stock' : 'ပုံမှန်'; }
function exportReport(report: Report) {
  if (Platform.OS !== 'web') return;
  const safe = (value: unknown) => {
    let str = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(str)) str = `'${str}`;
    return `"${str.replace(/"/g, '""')}"`;
  };
  const rows: unknown[][] = [['NOVA Daily Order & Manual Stock', report.date, 'Asia/Yangon'], ['Generated', time(report.generated_at)], ['Opening/In/Out/Closing are bottles. Order total excludes delivery; not payment received.'], [], ['Code', 'Scent', 'Size', 'Opening', 'Stock In', 'Stock Out', 'Closing']];
  report.balances.forEach(b => rows.push([b.product_id, names.get(b.product_id), b.size, b.opening ?? 'Not set', b.stock_in, b.stock_out, b.closing ?? 'Not set']));
  rows.push([], ['Time', 'Code', 'Size', 'In', 'Out', 'Before', 'After', 'Reason', 'Order', 'Admin']);
  report.movements.forEach(m => rows.push([time(m.created_at), m.product_id, m.size, m.delta > 0 ? m.delta : 0, m.delta < 0 ? -m.delta : 0, m.balance_before, m.balance_after, m.reason, m.order_number, m.actor_email]));
  rows.push([], ['Order', 'Customer', 'Current status', 'Items', 'Merchandise total']);
  report.orders.forEach(o => rows.push([o.order_number, o.customer_name, statuses[o.status] || o.status, o.items.map(i => `${i.product_id} ${i.size} x ${i.quantity}`).join('; '), o.total]));
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `NOVA_Daily_${report.date}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AdminStock({ api, mode, onBusyChange }: { api: Api; mode: 'stock' | 'daily'; onBusyChange: (value: boolean) => void }) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'empty' | 'unset'>('all');
  const [productId, setProductId] = useState('NV-001');
  const [size, setSize] = useState('10ml');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('ပစ္စည်းအသစ်ဝင်');
  const [orderNumber, setOrderNumber] = useState('');
  const [date, setDate] = useState(myanmarDay());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const request = useRef({ signature: '', id: '' });
  const reportRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; reportRequest.current++; }; }, []);
  const loadStock = useCallback(async () => { const data = await api('/api/admin/inventory?view=bottles'); if (mounted.current) setVariants(data.variants || []); }, [api]);
  const loadDaily = useCallback(async (day: string) => {
    const seq = ++reportRequest.current;
    setLoading(true); setError(''); setReport(null);
    try { const data = await api(`/api/admin/inventory?view=daily&date=${encodeURIComponent(day)}`); if (mounted.current && seq === reportRequest.current) setReport(data.report); }
    catch (e: any) { if (mounted.current && seq === reportRequest.current) setError(e.message); }
    finally { if (mounted.current && seq === reportRequest.current) setLoading(false); }
  }, [api]);
  useEffect(() => {
    if (mode === 'daily') { setDate(myanmarDay()); void loadDaily(myanmarDay()); }
    else { setLoading(true); loadStock().catch(e => { if (mounted.current) setError(e.message); }).finally(() => { if (mounted.current) setLoading(false); }); }
  }, [mode, loadStock, loadDaily]);
  const byVariant = useMemo(() => new Map(variants.map(v => [`${v.product_id}:${v.size}`, v.quantity])), [variants]);
  const matching = novaCatalog.filter(p => `${p.id} ${p.name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const rows = matching.flatMap(p => ['10ml', '30ml'].map(size => ({ ...p, size, quantity: byVariant.get(`${p.id}:${size}`) })));
  const visible = rows.filter(v => filter === 'all' || (filter === 'low' ? v.quantity != null && v.quantity > 0 && v.quantity <= 10 : filter === 'empty' ? v.quantity === 0 : v.quantity == null));
  const current = byVariant.get(`${productId}:${size}`);
  const validAmount = /^\d+$/.test(amount) && Number(amount) > 0 && Number(amount) <= 1000000;
  const next = validAmount ? (current ?? 0) + direction * Number(amount) : null;
  const save = async () => {
    if (pending.current) return;
    if (!validAmount || !reason.trim() || next == null || next < 0) { setError('အရေအတွက်၊ အကြောင်းရင်းနဲ့ လက်ကျန်ကို ပြန်စစ်ပါ။ လက်ကျန်ထက် ပိုနုတ်လို့မရပါ။'); return; }
    pending.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('');
    const body = { action: 'adjust_bottle', productId, size, delta: direction * Number(amount), reason: reason.trim(), orderNumber: orderNumber.trim() || null };
    const signature = JSON.stringify(body);
    if (request.current.signature !== signature) request.current = { signature, id: `STOCK_${Date.now()}_${Math.random().toString(36).slice(2, 12)}` };
    let saved = false;
    try {
      const data = await api('/api/admin/inventory', 'POST', { ...body, requestId: request.current.id });
      saved = true; request.current = { signature: '', id: '' }; setAmount(''); setOrderNumber(''); setReport(null);
      setNotice(`${productId} · ${size} ${direction > 0 ? 'အဝင်' : 'အထွက်'} သိမ်းပြီးပါပြီ။ လက်ကျန် ${data.movement.balance_after} လုံး။`);
      await loadStock();
    } catch (e: any) { setError(saved ? 'စာရင်းသိမ်းပြီးပါပြီ။ လက်ကျန်ပြန်တင်မရသေးလို့ Refresh နှိပ်ပါ။ ထပ်မထည့်ပါနဲ့။' : `${e.message} — တူညီတဲ့စာရင်းကို ပြန်နှိပ်ရင် နှစ်ခါမနုတ်/မပေါင်းအောင် စစ်ပေးပါမယ်။`); }
    finally { pending.current = false; setSaving(false); onBusyChange(false); }
  };
  if (mode === 'daily') return <View>
    <Text style={s.title}>နေ့စဉ် Order / Stock စာရင်း</Text>
    <Text style={s.help}>Myanmar Time (00:00–24:00) အလိုက် စာရင်းကြည့်ခြင်းပါ။ စာရင်းကြည့်တာကြောင့် Stock မနုတ်ပါ။ ရက်ဟောင်းတွေကိုလည်း ပြန်ကြည့်နိုင်ပါတယ်။</Text>
    <Text style={s.label}>ရက်စွဲ (YYYY-MM-DD)</Text>
    <TextInput accessibilityLabel="နေ့စဉ်စာရင်း ရက်စွဲ" value={date} onChangeText={value => { setDate(value); reportRequest.current++; setReport(null); setLoading(false); }} style={s.input} maxLength={10} />
    <View style={s.row}><Button title={loading ? 'စာရင်းတင်နေ…' : 'နေ့စဉ်စာရင်းပိတ်ကြည့်ရန်'} disabled={loading} active onPress={() => void loadDaily(date)} />{report && Platform.OS === 'web' ? <Button title="CSV သိမ်းရန်" onPress={() => exportReport(report)} /> : null}</View>
    {error ? <Text style={s.error}>{error}</Text> : null}
    {report ? <>
      <Text style={s.label}>{report.date} · ပြန်တွက်ချိန် {time(report.generated_at)}</Text>
      <Text style={s.help}>ဒီစာရင်းက လက်ရှိအချက်အလက်အပေါ် ပြန်တွက်ထားတဲ့ အနှစ်ချုပ်ပါ။ အပြီးသတ် lock မလုပ်ပါ။ Order status က လက်ရှိ status ဖြစ်ပြီး ငွေလက်ခံရရှိစာရင်း မဟုတ်ပါ။</Text>
      <View style={s.card}><Text style={s.label}>Order {report.order_count} ခု · ပယ်ဖျက် {report.cancelled_count} ခု</Text><Text style={s.label}>ပယ်ဖျက် Order မပါ ပစ္စည်းတန်ဖိုး {money(report.merchandise_total)}</Text><Text style={s.help}>Delivery fee မပါ။ Order တန်ဖိုးနဲ့ Stock Out က သီးခြားစာရင်းပါ။</Text><Text style={s.label}>Stock In {report.movements.reduce((a, m) => a + Math.max(0, m.delta), 0)} လုံး · Stock Out {report.movements.reduce((a, m) => a + Math.max(0, -m.delta), 0)} လုံး</Text></View>
      <Text style={s.heading}>အဖွင့် / အဝင် / အထွက် / အပိတ်</Text>
      {report.balances.filter(b => b.closing != null).map(b => <View key={`${b.product_id}:${b.size}`} style={s.card}><Text style={s.label}>{b.product_id} · {names.get(b.product_id)} · {b.size}</Text><Text style={s.help}>အဖွင့် {b.opening ?? '—'} + အဝင် {b.stock_in} − အထွက် {b.stock_out} = အပိတ် {b.closing ?? '—'} လုံး</Text></View>)}
      {!report.balances.some(b => b.closing != null) ? <Text style={s.help}>ဒီရက်အထိ ပုလင်းစာရင်း မသွင်းရသေးပါ။</Text> : null}
      <Text style={s.heading}>Stock In / Out မှတ်တမ်း ({report.movements.length})</Text>
      {report.movements.map(m => <View key={m.id} style={s.card}><Text style={[s.label, m.delta < 0 && s.low]}>{m.product_id} · {m.size} · {m.delta > 0 ? 'အဝင်' : 'အထွက်'} {Math.abs(m.delta)} လုံး</Text><Text style={s.help}>{m.balance_before} → {m.balance_after} · {m.reason}{m.order_number ? ` · ${m.order_number}` : ''}</Text><Text style={s.help}>{time(m.created_at)} · {m.actor_email}</Text></View>)}
      {!report.movements.length ? <Text style={s.help}>ဒီရက်မှာ Stock အဝင်/အထွက် မရှိပါ။</Text> : null}
      <Text style={s.heading}>နေ့စဉ် Order list ({report.orders.length})</Text>
      {report.orders.map(o => <View key={o.id} style={s.card}><Text style={s.label}>{o.order_number} · {o.customer_name}</Text><Text style={s.help}>{statuses[o.status] || o.status} · {money(o.total)}</Text>{o.items.map((i, index) => <Text key={index} style={s.help}>{i.product_id} · {i.size} × {i.quantity}</Text>)}</View>)}
      {!report.orders.length ? <Text style={s.help}>ဒီရက်မှာ Order မရှိပါ။</Text> : null}
    </> : null}
  </View>;
  return <View>
    <Text style={s.title}>ပုလင်း Stock In / Out</Text>
    <Text style={s.help}>Admin က ကိုယ်တိုင် စာရင်းထည့်/နုတ်ပါ။ Order တက်လာရုံနဲ့ မနုတ်ပါ။ Customer ဘက်မှာ လက်ကျန်နံပါတ် မပြပါ။</Text>
    <View style={s.row}><Button title="Stock In · ပစ္စည်းဝင်" active={direction === 1} disabled={saving} onPress={() => { setDirection(1); setReason('ပစ္စည်းအသစ်ဝင်'); }} /><Button title="Stock Out · ပစ္စည်းထွက်" active={direction === -1} disabled={saving} onPress={() => { setDirection(-1); setReason('ရောင်းချ'); }} /></View>
    <View style={s.card}>
      <Text style={s.label}>အနံ့ရွေးရန် / ရှာရန်</Text><TextInput accessibilityLabel="အနံ့ရှာရန်" value={search} editable={!saving} onChangeText={setSearch} placeholder="NV Code / အနံ့အမည်" style={s.input} />
      <View style={s.row}>{matching.map(p => <Button key={p.id} title={p.id} active={productId === p.id} disabled={saving} onPress={() => setProductId(p.id)} />)}</View>
      <Text style={s.label}>{productId} · {names.get(productId)}</Text>
      <View style={s.row}>{['10ml', '30ml'].map(option => <Button key={option} title={option} active={size === option} disabled={saving} onPress={() => setSize(option)} />)}</View>
      <Text style={s.label}>လက်ရှိ {current == null ? 'စာရင်းမသွင်းရသေး' : `${current} လုံး`}</Text>
      <Text style={s.help}>ပထမဆုံး စာရင်းသွင်းရာမှာ လက်ရှိရေတွက်ထားတဲ့ ပုလင်းအရေအတွက်ကို Stock In / စာရင်းစဖွင့် အဖြစ်ထည့်ပါ။</Text>
      <Text style={s.label}>{direction > 0 ? 'ထည့်မည့်' : 'နုတ်မည့်'} အရေအတွက် (လုံး)</Text><TextInput accessibilityLabel="Stock အရေအတွက်" value={amount} onChangeText={setAmount} editable={!saving} keyboardType="number-pad" maxLength={7} placeholder="ဥပမာ 5" style={s.input} />
      <View style={s.row}>{(direction > 0 ? ['ပစ္စည်းအသစ်ဝင်', 'စာရင်းစဖွင့်', 'ပြန်လက်ခံ'] : ['ရောင်းချ', 'Giveaway / Tester', 'ပျက်စီး']).map(value => <Button key={value} title={value} active={reason === value} disabled={saving} onPress={() => setReason(value)} />)}</View>
      <TextInput accessibilityLabel="Stock အကြောင်းရင်း" value={reason} onChangeText={setReason} editable={!saving} maxLength={500} style={s.input} />
      <Text style={s.label}>Order number (ရှိမှထည့်ပါ)</Text><TextInput accessibilityLabel="Stock ဆိုင်ရာ Order number" value={orderNumber} onChangeText={setOrderNumber} editable={!saving} maxLength={100} placeholder="NOVA-…" style={s.input} />
      {next != null ? <Text style={[s.label, next < 0 && s.low]}>သိမ်းပြီးနောက် {next} လုံး {next < 0 ? '— လက်ကျန်မလုံလောက်ပါ' : ''}</Text> : null}
      <Button title={saving ? 'သိမ်းနေ…' : `${direction > 0 ? 'ပစ္စည်းဝင်' : 'ပစ္စည်းထွက်'} သိမ်းရန်`} active disabled={saving || loading || !validAmount || next == null || next < 0 || !reason.trim()} onPress={() => void save()} />
    </View>
    {notice ? <Text style={s.success}>{notice}</Text> : null}{error ? <Text style={s.error}>{error}</Text> : null}
    <View style={s.row}><Button title="Refresh" disabled={saving || loading} onPress={() => { setError(''); void loadStock().catch(e => setError(e.message)); }} />{(['all', 'low', 'empty', 'unset'] as const).map(value => <Button key={value} title={{ all: 'အားလုံး', low: '၁၀ လုံးနဲ့အောက်', empty: 'ကုန်ပြီ', unset: 'မသွင်းရသေး' }[value]} active={filter === value} onPress={() => setFilter(value)} />)}</View>
    <Text style={s.help}>၁၀ လုံးနဲ့အောက်ကို Admin မှာပဲ အနီပြထားပါတယ်။ အဟောင်းက size မခွဲထားတဲ့ units နဲ့ အရည် ml ကို “အဟောင်း / အရည် ml” မှာ ပြန်ကြည့်နိုင်ပါတယ်။</Text>
    {loading ? <Text style={s.help}>စာရင်းတင်နေပါတယ်…</Text> : visible.map(v => <View key={`${v.id}:${v.size}`} style={s.card}><Text style={s.label}>{v.id} · {v.name} · {v.size}</Text><Text style={[s.label, v.quantity != null && v.quantity <= 10 && s.low]}>{v.quantity == null ? '—' : `${v.quantity} လုံး`} · {stockLabel(v.quantity)}</Text><Button title="ဒီပစ္စည်း ရွေးရန်" disabled={saving} onPress={() => { setProductId(v.id); setSize(v.size); }} /></View>)}
    {!loading && !visible.length ? <Text style={s.help}>ကိုက်ညီတဲ့ပစ္စည်း မရှိပါ။</Text> : null}
  </View>;
}
const s = StyleSheet.create({
  title: { color: '#102B62', fontSize: 20, fontWeight: '700', marginBottom: 10 }, heading: { color: '#102B62', fontSize: 17, fontWeight: '700', marginVertical: 14 },
  card: { backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#DADFE8', borderRadius: 12, padding: 14, marginVertical: 6 },
  label: { color: '#102B62', fontSize: 14, fontWeight: '600', marginVertical: 5, lineHeight: 23 }, help: { color: '#5D6575', fontSize: 13, lineHeight: 23, marginVertical: 4 },
  input: { borderWidth: 1, borderColor: '#BFC9D8', borderRadius: 9, padding: 12, fontSize: 15, color: '#102B62', backgroundColor: '#FFFFFF', marginVertical: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 7 }, button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, backgroundColor: '#E9EEF6', justifyContent: 'center', borderWidth: 1, borderColor: '#CDD7E6' },
  buttonText: { color: '#102B62', fontSize: 13, fontWeight: '600' }, active: { backgroundColor: '#102B62', borderColor: '#102B62' }, activeText: { color: '#FFFFFF' },
  low: { color: '#B42318' }, error: { color: '#9B1C15', backgroundColor: '#FFF0EE', padding: 12, lineHeight: 24, marginVertical: 8 }, success: { color: '#176534', backgroundColor: '#EAF5EC', padding: 12, lineHeight: 24, marginVertical: 8 },
});

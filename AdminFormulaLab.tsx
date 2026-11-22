import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { novaCatalog } from './data/nova-catalog';

const KEY = '@nova/admin/formula-lab/v1';
const fmt = (n: number) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
type Draft = { scent: string; size: string; oil: string; water: string; fixative: string; oilRate: string; alcoholRate: string; waterRate: string; fixRate: string; bottle: string; box: string; label: string; labor: string; overhead: string; marketing: string; shipping: string; fee: string; discount: string; price: string; batch: string; memo: string };
const initial: Draft = { scent: 'NV-001', size: '10', oil: '20', water: '0', fixative: '0', oilRate: '0', alcoholRate: '0', waterRate: '0', fixRate: '0', bottle: '0', box: '0', label: '0', labor: '0', overhead: '0', marketing: '0', shipping: '0', fee: '0', discount: '0', price: '15000', batch: '1', memo: '' };
const number = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const currency = (n: number) => fmt(n) + ' Ks';

function Input({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return <View style={s.field}><Text style={s.label}>{label}{suffix ? ' (' + suffix + ')' : ''}</Text><TextInput accessibilityLabel={label} keyboardType="decimal-pad" value={value} onChangeText={onChange} style={s.input} selectTextOnFocus /></View>;
}
function Metric({ label, value, important = false }: { label: string; value: string; important?: boolean }) {
  return <View style={s.metric}><Text style={s.label}>{label}</Text><Text style={[s.metricValue, important && { color: '#1D6946' }]}>{value}</Text></View>;
}
export default function AdminFormulaLab() {
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState<{ id: string; created: string; draft: Draft }[]>([]);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const set = (key: keyof Draft, value: string) => setDraft(old => ({ ...old, [key]: value }));
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(data => {
      if (data) { const parsed = JSON.parse(data); if (Array.isArray(parsed)) setSaved(parsed.filter(x => x?.id && x.draft).slice(0, 100)); }
    }).catch(() => setMessage('Saved formulas could not be loaded on this device.')).finally(() => setReady(true));
  }, []);
  const calculation = useMemo(() => {
    const size = number(draft.size), oilPct = number(draft.oil), waterPct = number(draft.water), fixPct = number(draft.fixative);
    const alcoholPct = 100 - oilPct - waterPct - fixPct;
    const quantity = number(draft.batch);
    const fields: (keyof Draft)[] = ['oilRate', 'alcoholRate', 'waterRate', 'fixRate', 'bottle', 'box', 'label', 'labor', 'overhead', 'marketing', 'shipping', 'fee', 'discount', 'price'];
    const valid = size > 0 && size <= 10000 && quantity >= 1 && Number.isInteger(quantity) && quantity <= 100000 &&
      [oilPct, waterPct, fixPct, alcoholPct].every(n => Number.isFinite(n) && n >= 0 && n <= 100) &&
      fields.every(k => Number.isFinite(number(draft[k])) && number(draft[k]) >= 0) && number(draft.discount) <= 100 && number(draft.fee) <= 100;
    if (!valid) return null;
    const oilMl = size * oilPct / 100, alcoholMl = size * alcoholPct / 100, waterMl = size * waterPct / 100, fixMl = size * fixPct / 100;
    const raw = oilMl * number(draft.oilRate) + alcoholMl * number(draft.alcoholRate) + waterMl * number(draft.waterRate) + fixMl * number(draft.fixRate);
    const production = raw + number(draft.bottle) + number(draft.box) + number(draft.label) + number(draft.labor) + number(draft.overhead);
    const revenue = number(draft.price) * (1 - number(draft.discount) / 100);
    const sellingExpense = number(draft.marketing) + number(draft.shipping) + revenue * number(draft.fee) / 100;
    const profit = revenue - production - sellingExpense;
    return { alcoholPct, oilMl, alcoholMl, waterMl, fixMl, raw, production, revenue, sellingExpense, profit, margin: revenue ? profit / revenue * 100 : 0, markup: production ? profit / production * 100 : 0, quantity };
  }, [draft]);
  const changeSize = (size: string) => setDraft(v => ({ ...v, size, price: size === '10' ? '15000' : size === '30' ? '35000' : v.price }));
  const persist = async (next: typeof saved) => { await AsyncStorage.setItem(KEY, JSON.stringify(next)); setSaved(next); };
  const save = async () => {
    if (!calculation || !ready) { setMessage('Formula inputs need to be valid before saving.'); return; }
    try {
      const next = [{ id: String(Date.now()), created: new Date().toISOString(), draft: { ...draft } }, ...saved].slice(0, 100);
      await persist(next); setMessage('Saved on this browser/device only.');
    } catch { setMessage('Save failed. Check available device storage.'); }
  };
  const remove = async (id: string) => {
    try { await persist(saved.filter(item => item.id !== id)); setMessage('Saved formula removed.'); }
    catch { setMessage('Could not remove the saved formula.'); }
  };
  return <View style={s.root}>
    <Text style={s.title}>NOVA · Formula & Profit Lab</Text>
    <Text style={s.help}>Private planning tool. Cost inputs in Ks; ingredient rates in Ks per ml. Calculations use nominal volume, not density-corrected weights. Formula records stay on this device and are NOT synced to Supabase.</Text>
    <Text style={s.subtitle}>1. Scent & bottle size</Text>
    <View style={s.chips}>{novaCatalog.map(item => <Pressable key={item.id} onPress={() => set('scent', item.id)} style={[s.chip, draft.scent === item.id && s.chipOn]}><Text style={[s.chipText, draft.scent === item.id && s.chipTextOn]}>{item.id}</Text></Pressable>)}</View>
    <View style={s.chips}>{['10', '15', '30', '50', '100'].map(size => <Pressable key={size} onPress={() => changeSize(size)} style={[s.chip, draft.size === size && s.chipOn]}><Text style={[s.chipText, draft.size === size && s.chipTextOn]}>{size} ml</Text></Pressable>)}</View>
    <Input label="Batch quantity (bottles)" value={draft.batch} onChange={v => set('batch', v)} />
    <Text style={s.subtitle}>2. Formula (%)</Text>
    <View style={s.columns}>
      <Input label="Fragrance Oil" suffix="%" value={draft.oil} onChange={v => set('oil', v)} />
      <Input label="Distilled Water" suffix="%" value={draft.water} onChange={v => set('water', v)} />
      <Input label="Fixative" suffix="%" value={draft.fixative} onChange={v => set('fixative', v)} />
    </View>
    <Metric label="Ethanol (auto balance)" value={calculation ? fmt(calculation.alcoholPct) + '%' : 'Invalid formula'} />
    {calculation ? <Text style={s.help}>Per bottle: Oil {fmt(calculation.oilMl)} ml + Ethanol {fmt(calculation.alcoholMl)} ml + Water {fmt(calculation.waterMl)} ml + Fixative {fmt(calculation.fixMl)} ml = {draft.size} ml</Text> : <Text style={s.error}>All percentages must total 100% or less, and quantities/costs must be valid non-negative numbers.</Text>}
    <Text style={s.subtitle}>3. Ingredients purchase cost</Text>
    <View style={s.columns}>
      <Input label="Oil cost" suffix="Ks/ml" value={draft.oilRate} onChange={v => set('oilRate', v)} />
      <Input label="Ethanol cost" suffix="Ks/ml" value={draft.alcoholRate} onChange={v => set('alcoholRate', v)} />
      <Input label="Water cost" suffix="Ks/ml" value={draft.waterRate} onChange={v => set('waterRate', v)} />
      <Input label="Fixative cost" suffix="Ks/ml" value={draft.fixRate} onChange={v => set('fixRate', v)} />
    </View>
    <Text style={s.subtitle}>4. Packaging & manufacturing (Ks per bottle)</Text>
    <View style={s.columns}>
      <Input label="Bottle / Atomizer" value={draft.bottle} onChange={v => set('bottle', v)} />
      <Input label="Box" value={draft.box} onChange={v => set('box', v)} />
      <Input label="Label" value={draft.label} onChange={v => set('label', v)} />
      <Input label="Labor" value={draft.labor} onChange={v => set('labor', v)} />
      <Input label="Overhead / Wastage" value={draft.overhead} onChange={v => set('overhead', v)} />
    </View>
    <Text style={s.subtitle}>5. Selling cost & price</Text>
    <View style={s.columns}>
      <Input label="Retail price" suffix="Ks" value={draft.price} onChange={v => set('price', v)} />
      <Input label="Discount" suffix="%" value={draft.discount} onChange={v => set('discount', v)} />
      <Input label="Marketing" suffix="Ks/bottle" value={draft.marketing} onChange={v => set('marketing', v)} />
      <Input label="Shipping paid by shop" suffix="Ks/bottle" value={draft.shipping} onChange={v => set('shipping', v)} />
      <Input label="Platform/payment fee" suffix="%" value={draft.fee} onChange={v => set('fee', v)} />
    </View>
    {calculation ? <View style={s.result}>
      <Text style={s.resultTitle}>LIVE PROFIT BREAKDOWN</Text>
      <Metric label="Ingredients / bottle" value={currency(calculation.raw)} />
      <Metric label="Production cost / bottle" value={currency(calculation.production)} />
      <Metric label="Sales after discount / bottle" value={currency(calculation.revenue)} />
      <Metric label="Other selling expenses / bottle" value={currency(calculation.sellingExpense)} />
      <Metric label="Estimated net contribution / bottle" value={currency(calculation.profit)} important />
      <Metric label="Profit margin (profit ÷ net sales)" value={fmt(calculation.margin) + '%'} important />
      <Metric label="Return on production cost (profit ÷ production)" value={fmt(calculation.markup) + '%'} />
      <Metric label="Batch production cost" value={currency(calculation.production * calculation.quantity)} />
      <Metric label="Batch sales" value={currency(calculation.revenue * calculation.quantity)} />
      <Metric label="Batch estimated profit" value={currency(calculation.profit * calculation.quantity)} important />
    </View> : null}
    <Text style={s.label}>Test note / lot / aging / observations</Text>
    <TextInput multiline value={draft.memo} onChangeText={v => set('memo', v)} accessibilityLabel="Experiment note" placeholder="Enter a note..." style={[s.input, { minHeight: 76, textAlignVertical: 'top' }]} />
    <Pressable accessibilityRole="button" disabled={!calculation || !ready} onPress={save} style={[s.save, (!calculation || !ready) && { opacity: 0.5 }]}><Text style={s.saveText}>Save formula to this device</Text></Pressable>
    {message ? <Text style={s.help} accessibilityLiveRegion="polite">{message}</Text> : null}
    <Text style={s.subtitle}>Saved experiments ({saved.length})</Text>
    {saved.length ? saved.map(entry => <View key={entry.id} style={s.saved}>
      <Text style={s.label}>{entry.draft.scent} · {entry.draft.size} ml · Oil {entry.draft.oil}% · {new Date(entry.created).toLocaleString()}</Text>
      <View style={s.chips}>
        <Pressable onPress={() => { setDraft({ ...initial, ...entry.draft }); setMessage('Formula loaded. Edit and save a new test.'); }} style={s.chip}><Text style={s.chipText}>Load / Edit</Text></Pressable>
        <Pressable onPress={() => remove(entry.id)} style={s.chip}><Text style={s.chipText}>Delete</Text></Pressable>
      </View>
    </View>) : <Text style={s.help}>No formula saved yet.</Text>}
    <Text style={s.help}>Safety: Verify IFRA Category 4 maximum concentration for each fragrance and relevant SDS before skin tests or production. This tool is not an IFRA safety certification. Customer prices and stock are not changed by this calculator.</Text>
  </View>;
}
const s = StyleSheet.create({
 root: { paddingBottom: 28 }, title: { fontSize: 22, fontWeight: '800', color: '#102B62', marginBottom: 8 },
 subtitle: { fontSize: 17, fontWeight: '800', color: '#102B62', marginTop: 20, marginBottom: 10 },
 help: { color: '#70675D', fontSize: 13, lineHeight: 20, marginBottom: 10 },
 chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
 chip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: '#F2E9D8', borderWidth: 1, borderColor: '#D8C7AC' },
 chipOn: { backgroundColor: '#102B62', borderColor: '#102B62' }, chipText: { color: '#102B62', fontWeight: '700', fontSize: 12 }, chipTextOn: { color: '#FFFFFF' },
 columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { flexGrow: 1, minWidth: 135, flexBasis: '45%', marginBottom: 7 },
 label: { color: '#453F38', fontWeight: '700', fontSize: 13, marginBottom: 5 },
 input: { backgroundColor: '#FFFFFF', color: '#102B62', borderColor: '#D9CDBD', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 11, fontSize: 15 },
 metric: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E7DBCA' },
 metricValue: { color: '#102B62', fontSize: 15, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
 error: { color: '#9E3F35', marginVertical: 8 }, result: { backgroundColor: '#FFF9ED', borderRadius: 14, borderColor: '#D8BB7B', borderWidth: 1, padding: 12, marginTop: 18 },
 resultTitle: { color: '#9B6E1C', fontWeight: '800', fontSize: 13, letterSpacing: 1, marginBottom: 6 },
 save: { backgroundColor: '#102B62', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 12 },
 saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
 saved: { backgroundColor: '#FFFFFF', padding: 12, marginVertical: 5, borderWidth: 1, borderColor: '#E6D9C8', borderRadius: 10 }
});

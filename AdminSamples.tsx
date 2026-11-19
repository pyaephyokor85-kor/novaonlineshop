import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
type Props = { api: (path: string, method?: string, body?: any) => Promise<any>; onEditingChange: (value: boolean) => void; onBusyChange: (value: boolean) => void };
const monthNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit' }).format(new Date()).replace('/', '-');
const field = { borderWidth: 1, borderColor: '#D8D0C1', borderRadius: 10, padding: 12, marginTop: 8, color: '#102B62', backgroundColor: '#FFFFFF', fontSize: 16 } as const;
const label = { color: '#102B62', fontSize: 16, marginTop: 16, lineHeight: 26, fontWeight: '600' } as const;
export default function AdminSamples({ api, onEditingChange, onBusyChange }: Props) {
  const [monthQuery, setMonthQuery] = useState(monthNow), [month, setMonth] = useState(monthNow);
  const [revision, setRevision] = useState(0), [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(''), [rules, setRules] = useState(''), [codes, setCodes] = useState(''), [count, setCount] = useState('1'), [capacity, setCapacity] = useState('');
  const [applications, setApplications] = useState<any[]>([]), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { onEditingChange(dirty); }, [dirty, onEditingChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onEditingChange(false); onBusyChange(false); }, [onEditingChange, onBusyChange]);
  const read = async (value: string) => {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) { setError('လကို YYYY-MM ပုံစံနဲ့ ဖြည့်ပေးပါ။'); return; }
    if (dirty && Platform.OS === 'web' && !window.confirm('မသိမ်းရသေးတဲ့ Campaign ပြင်ဆင်မှုတွေ ပယ်ပြီး ပြန်ဖတ်မလား။')) return;
    setBusy(true); setError(''); setNotice(''); setLoaded(false);
    try {
      const data = await api(`/api/admin/media?view=samples&month=${value}`);
      const campaign = data.campaign;
      setMonth(value); setRevision(campaign?.revision || 0); setEnabled(Boolean(campaign?.enabled)); setTitle(campaign?.settings.title || ''); setRules(campaign?.settings.rules || ''); setCodes((campaign?.settings.codes || []).join(', ')); setCount(String(campaign?.settings.selectionCount || 1)); setCapacity(campaign?.settings.capacity ? String(campaign.settings.capacity) : ''); setApplications(data.applications || []); setDirty(false); setLoaded(true);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { read(monthNow()); }, [api]);
  const change = (setter: (value: string) => void) => (value: string) => { setter(value); setDirty(true); };
  const button = (text: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={action} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 11, marginTop: 10, borderRadius: 10, backgroundColor: '#102B62', opacity: busy || disabled ? .5 : 1 }}><Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{text}</Text></Pressable>;
  const save = async () => {
    if (!loaded || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/api/admin/media?view=samples', 'POST', { action: 'campaign', month, revision, enabled, settings: { title, rules, codes: codes.split(/[\s,]+/).filter(Boolean).map(code => code.toUpperCase().replace(/[‐‑–—]/g, '-')), selectionCount: Number(count), capacity: capacity.trim() ? Number(capacity) : null } });
      setRevision(result.campaign.revision); setDirty(false); setNotice(`${month} Campaign သိမ်းပြီးပါပြီ။ ${enabled ? 'ဒီလအတွက် လျှောက်လွှာ ဖွင့်ထားပါတယ်။' : 'လျှောက်လွှာ ပိတ်ထားပါတယ်။'}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const status = async (id: string, value: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await api('/api/admin/media?view=samples', 'POST', { action: 'status', id, status: value }); setApplications(old => old.map(row => row.id === id ? { ...row, status: value } : row)); setNotice('လျှောက်လွှာအခြေအနေ သိမ်းပြီးပါပြီ။'); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <View><Text style={{ fontSize: 24, color: '#102B62', fontWeight: '700' }}>Free Sample Campaign</Text><Text style={{ fontSize: 15, color: '#647084', lineHeight: 26, marginTop: 8 }}>လစဉ် စည်းကမ်းကို သီးခြားသိမ်းပါတယ်။ ဖွင့်ထားတဲ့ လက်ရှိ Myanmar လအတွက်သာ လျှောက်လွှာလက်ခံပါမယ်။ Order / Stock စာရင်းနဲ့ မပေါင်းပါ။</Text>
    <Text style={label}>Campaign လ (YYYY-MM)</Text><TextInput accessibilityLabel="Campaign month" value={monthQuery} onChangeText={setMonthQuery} editable={!busy} maxLength={7} style={field} />{button('ဒီလစာရင်း ဖတ်မယ်', () => read(monthQuery))}
    {error ? <Text accessibilityRole="alert" style={{ color: '#9E3F35', fontSize: 15, lineHeight: 25, marginVertical: 12 }}>{error}</Text> : null}{notice ? <Text accessibilityRole="alert" style={{ color: '#355F3C', fontSize: 15, lineHeight: 25, marginVertical: 12 }}>{notice}</Text> : null}
    {loaded ? <>
      <Text style={label}>{month} · Revision {revision}</Text>
      <Text style={label}>Campaign ခေါင်းစဉ်</Text><TextInput accessibilityLabel="Campaign title" value={title} onChangeText={change(setTitle)} editable={!busy} maxLength={120} style={field} />
      <Text style={label}>ဒီလ Campaign စည်းကမ်းအပြည့်အစုံ</Text><Text style={{ color: '#647084', fontSize: 14, lineHeight: 24 }}>Tester ပမာဏ၊ ပို့ခ၊ လျှောက်နိုင်သူ၊ ရွေးချယ်ပေးပို့ပုံတို့ကို သေချာရေးပါ။</Text><TextInput accessibilityLabel="Monthly campaign rules" value={rules} onChangeText={change(setRules)} editable={!busy} multiline maxLength={4000} style={[field, { minHeight: 180, textAlignVertical: 'top', lineHeight: 27 }]} />
      <Text style={label}>ရွေးနိုင်သော NV Codes (Comma ခြားပါ)</Text><TextInput accessibilityLabel="Campaign scent codes" value={codes} onChangeText={change(setCodes)} editable={!busy} multiline maxLength={350} placeholder="NV-001, NV-005, NV-021" style={field} />
      <Text style={label}>တစ်ဦးလျှင် ရွေးရမယ့် NV Code အရေအတွက်</Text><TextInput accessibilityLabel="Required scent selection count" value={count} onChangeText={change(setCount)} editable={!busy} keyboardType="number-pad" maxLength={2} style={field} />
      <Text style={label}>လျှောက်လွှာ အများဆုံး (မကန့်သတ်ရင် လွတ်ထားပါ)</Text><TextInput accessibilityLabel="Campaign application limit" value={capacity} onChangeText={change(setCapacity)} editable={!busy} keyboardType="number-pad" maxLength={5} style={field} />
      {button(enabled ? 'လျှောက်လွှာ ဖွင့်မည် · ပိတ်ရန်နှိပ်ပါ' : 'လျှောက်လွှာ ပိတ်မည် · ဖွင့်ရန်နှိပ်ပါ', () => { setEnabled(!enabled); setDirty(true); })}<Text style={{ color: '#647084', marginTop: 8 }}>Save နှိပ်မှ အပြောင်းအလဲ အတည်ဖြစ်ပါမယ်။</Text>{button(busy ? 'သိမ်းနေပါတယ်…' : 'Save Campaign', save)}
      <Text style={[label, { fontSize: 22, marginTop: 30 }]}>လျှောက်လွှာများ · {applications.length}</Text><Text style={{ color: '#647084', fontSize: 14, lineHeight: 24 }}>ရွေးထားတဲ့လရဲ့ နောက်ဆုံး 200 စောင်ကို ပြပါတယ်။ ဖုန်းနံပါတ်တစ်ခုလျှင် တစ်လတစ်ကြိမ်။</Text>
      {!applications.length ? <Text style={{ marginTop: 12 }}>လျှောက်လွှာ မရှိသေးပါ။</Text> : applications.map(row => <View key={row.id} style={[field, { marginTop: 14 }]}><Text style={{ fontSize: 17, color: '#102B62', fontWeight: '700' }}>{row.customer_name} · {row.status}</Text><Text selectable style={{ marginTop: 8, fontSize: 16 }}>{row.phone}</Text><Text selectable style={{ marginTop: 8, lineHeight: 25 }}>{row.address}</Text><Text style={{ marginTop: 8 }}>{row.scent_codes.join(' · ')}</Text><Text style={{ marginTop: 8 }}>{new Date(row.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })} · Rule v{row.campaign_revision}</Text><Text style={{ marginTop: 8, lineHeight: 24 }}>လျှောက်စဉ် စည်းကမ်း: {row.campaign_snapshot.rules}</Text>{['pending','approved','declined','shipped'].map(value => <View key={value}>{button(value, () => status(row.id, value), row.status === value)}</View>)}</View>)}
    </> : busy ? <Text style={{ marginTop: 15 }}>ဖတ်နေပါတယ်…</Text> : null}
  </View>;
}

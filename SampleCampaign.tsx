import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { novaCatalog } from './data/nova-catalog';
type Campaign = { month: string; revision: number; settings: { title: string; rules: string; codes: string[]; selectionCount: number; capacity: number | null } };
const endpoint = '/api/storefront-media?view=samples';
const url = () => `${Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '')}${endpoint}`;
export function SampleInvitation({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Apply free sample" onPress={onPress} style={s.invitation}><View style={s.invitationTop}><Text style={s.kicker}>NOVA DISCOVERY CAMPAIGN</Text><Text style={s.star}>✦</Text></View><Text style={s.invitationTitle}>Apply free sample</Text><Text style={s.invitationCopy}>အိမ်မှာနေရင်း NOVA ရနံ့တွေကို စမ်းသပ်ဖို့ ဒီလ Campaign စည်းကမ်းတွေ ကြည့်ပြီး လျှောက်ထားနိုင်ပါတယ်။</Text><Text style={s.invitationLink}>Campaign ကြည့်ပြီး လျှောက်မယ်</Text></Pressable>;
}
export default function SampleCampaign({ close }: { close: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false);
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [address, setAddress] = useState('');
  const [codes, setCodes] = useState<string[]>([]), [accepted, setAccepted] = useState(false);
  const key = useRef(''), locked = useRef(false), uncertain = useRef(false);
  const load = async () => {
    setLoading(true); setError(''); setCodes([]); setAccepted(false); key.current = ''; uncertain.current = false;
    try {
      const response = await fetch(url()); const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Campaign ကို ဖတ်မရသေးပါ။ နောက်မှ ပြန်စမ်းပါ။');
      setCampaign(body.campaign || null);
    } catch (e: any) { setCampaign(null); setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    if (!campaign || locked.current) return;
    if (!name.trim() || !phone.trim() || !address.trim() || !accepted || codes.length !== campaign.settings.selectionCount) { setError('အချက်အလက် အပြည့်ဖြည့်ပြီး သတ်မှတ်ထားတဲ့ NV Codes နဲ့ စည်းကမ်းလက်ခံမှုကို ရွေးပေးပါ။'); return; }
    locked.current = true; setSending(true); setError('');
    if (!key.current) key.current = `sample_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    try {
      const response = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: campaign.month, revision: campaign.revision, name, phone, address, codes, acceptedRules: accepted, requestKey: key.current }) });
      const body = await response.json();
      if (!response.ok || body.ok !== true || !body.applicationId) {
        if (response.status === 400 || response.status === 409) { uncertain.current = false; key.current = ''; }
        throw new Error(body.error || 'လျှောက်လွှာပို့မှုကို အတည်မပြုနိုင်သေးပါ။');
      }
      setSuccess(String(body.applicationId)); uncertain.current = false;
    } catch (e: any) { setError(`${e.message} မသေချာပါက အချက်အလက်မပြောင်းဘဲ ပြန်ပို့နိုင်ပါတယ်။`); uncertain.current = Boolean(key.current); }
    finally { locked.current = false; setSending(false); }
  };
  const editable = !sending && !uncertain.current;
  return <SafeAreaView style={s.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close sample campaign" disabled={sending} onPress={close} style={s.back}><Text style={s.backText}>ပြန်သွားမယ်</Text></Pressable>
    <Text style={s.kickerDark}>NOVA DISCOVERY CAMPAIGN</Text><Text style={s.heading}>Apply free sample</Text>
    {loading ? <Text style={s.copy}>Campaign ဖတ်နေပါတယ်…</Text> : success ? <View style={s.panel}><Text style={s.title}>လျှောက်လွှာ လက်ခံပြီးပါပြီ</Text><Text style={s.copy}>Campaign စည်းကမ်းအတိုင်း Admin က စစ်ဆေးပြီး ဆက်သွယ်ပါမယ်။ Tester ရရှိမှု အတည်ပြုချက် မဟုတ်သေးပါ။</Text><Text selectable style={s.copy}>Application ID: {success}</Text></View> : <>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {!campaign ? <View style={s.panel}><Text style={s.title}>Campaign မကြာမီ စတင်ပါမည်</Text><Text style={s.copy}>ဒီလအတွက် လျှောက်လွှာ မဖွင့်ရသေးပါ။ လစဉ် အစီအစဉ်နဲ့ စည်းကမ်းတွေ မတူနိုင်လို့ ပြန်ဝင်ကြည့်ပေးပါ။</Text><Pressable accessibilityRole="button" onPress={load} style={s.button}><Text style={s.buttonText}>ပြန်စစ်မယ်</Text></Pressable></View> : <>
        <View style={s.panel}><Text style={s.kickerDark}>{campaign.month}</Text><Text style={s.title}>{campaign.settings.title}</Text><Text style={s.rules}>{campaign.settings.rules}</Text></View>
        <Text style={s.label}>အမည်</Text><TextInput accessibilityLabel="Sample applicant name" value={name} onChangeText={setName} editable={editable} maxLength={120} style={s.field} autoComplete="name" />
        <Text style={s.label}>ဆက်သွယ်ရန် ဖုန်း</Text><TextInput accessibilityLabel="Sample applicant phone" value={phone} onChangeText={setPhone} editable={editable} maxLength={30} keyboardType="phone-pad" style={s.field} autoComplete="tel" />
        <Text style={s.label}>ပို့ရမယ့် လိပ်စာအပြည့်အစုံ (မြို့နယ်ပါ)</Text><TextInput accessibilityLabel="Sample delivery address" value={address} onChangeText={setAddress} editable={editable} maxLength={500} multiline style={[s.field, { minHeight: 90 }]} />
        <Text style={s.label}>NV Code {campaign.settings.selectionCount} မျိုး ရွေးပါ · {codes.length} မျိုး ရွေးပြီး</Text>
        <View style={s.codeGrid}>{campaign.settings.codes.map(code => <Pressable key={code} accessibilityRole="checkbox" accessibilityLabel={`Sample scent ${code}`} accessibilityState={{ checked: codes.includes(code), disabled: !editable }} disabled={!editable || (!codes.includes(code) && codes.length >= campaign.settings.selectionCount)} onPress={() => setCodes(old => old.includes(code) ? old.filter(x => x !== code) : [...old, code])} style={[s.code, codes.includes(code) && s.codeSelected]}><Text style={s.codeText}>{code}</Text><Text style={s.small}>{novaCatalog.find(p => p.id === code)?.name}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Accept current sample campaign rules" accessibilityState={{ checked: accepted, disabled: !editable }} disabled={!editable} onPress={() => setAccepted(value => !value)} style={s.accept}><Text style={s.acceptMark}>{accepted ? '☑' : '☐'}</Text><Text style={s.acceptText}>ဒီလ Campaign စည်းကမ်းတွေကို ဖတ်ပြီး လက်ခံပါတယ်။ လျှောက်လွှာအတွက် ဆက်သွယ်ဖို့ အချက်အလက်ပေးပို့ပါမယ်။</Text></Pressable>
        <Text style={s.small}>ဖုန်းနံပါတ်တစ်ခုကို Campaign တစ်လလျှင် တစ်ကြိမ်သာ လျှောက်ထားနိုင်ပါတယ်။ လျှောက်ထားခြင်းက Tester ရရှိမှု အာမခံချက် မဟုတ်ပါ။</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Submit sample application" disabled={sending} onPress={submit} style={[s.button, sending && { opacity: .5 }]}><Text style={s.buttonText}>{sending ? 'ပို့နေပါတယ်…' : 'လျှောက်လွှာ ပို့မယ်'}</Text></Pressable>
        {uncertain.current ? <Pressable accessibilityRole="button" onPress={load} style={s.back}><Text style={s.backText}>Campaign ပြန်ဖတ်ပြီး ပြင်မယ်</Text></Pressable> : null}
      </>}
    </>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
 invitation: { backgroundColor: '#102B62', borderRadius: 18, padding: 19, marginBottom: 22, borderWidth: 1, borderColor: '#1C3D76' },
 invitationTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: '#E8C977', fontSize: 11, letterSpacing: 1.1, fontWeight: '700' }, star: { color: '#E8C977', fontSize: 23 },
 invitationTitle: { fontSize: 27, color: '#FFFFFF', fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', marginTop: 5, fontWeight: '700' }, invitationCopy: { color: '#E4E9F1', fontSize: 15, lineHeight: 26, marginTop: 9 }, invitationLink: { color: '#E8C977', fontSize: 15, fontWeight: '700', marginTop: 14 },
 page: { flex: 1, backgroundColor: '#FBF9F5' }, content: { padding: 20, paddingBottom: 45, maxWidth: 760, width: '100%', alignSelf: 'center' }, back: { minHeight: 44, justifyContent: 'center', marginBottom: 10 }, backText: { color: '#946D25', fontSize: 16 },
 kickerDark: { color: '#946D25', fontSize: 12, fontWeight: '700', letterSpacing: 1 }, heading: { fontSize: 30, color: '#102B62', fontWeight: '700', marginTop: 8, marginBottom: 20 }, panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6DFD3', padding: 18, borderRadius: 16, marginBottom: 18 }, title: { color: '#102B62', fontSize: 21, fontWeight: '700', lineHeight: 30 }, copy: { fontSize: 16, lineHeight: 27, color: '#5E6879', marginTop: 12 }, rules: { fontSize: 16, lineHeight: 28, color: '#47556A', marginTop: 15 }, error: { color: '#9E3F35', fontSize: 15, lineHeight: 25, marginBottom: 15 },
 label: { color: '#102B62', fontSize: 16, lineHeight: 27, marginTop: 12, fontWeight: '600' }, field: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9D4CA', borderRadius: 12, padding: 13, color: '#102B62', fontSize: 16, marginTop: 6 }, codeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, code: { width: '48%', borderWidth: 1, borderColor: '#D9D4CA', padding: 10, borderRadius: 12, backgroundColor: '#FFFFFF', minHeight: 70 }, codeSelected: { borderColor: '#A67D29', backgroundColor: '#F6EBCF' }, codeText: { color: '#102B62', fontSize: 16, fontWeight: '700' }, small: { color: '#667080', fontSize: 14, lineHeight: 24, marginTop: 5 }, accept: { flexDirection: 'row', gap: 10, marginVertical: 18 }, acceptMark: { fontSize: 25, color: '#A67D29' }, acceptText: { flex: 1, color: '#47556A', fontSize: 15, lineHeight: 26 }, button: { backgroundColor: '#102B62', minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 24, marginTop: 18 }, buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { novaCatalog } from './data/nova-catalog';
import type { MediaRow } from './StorefrontMedia';
type Api = (path: string, method?: string, body?: any) => Promise<any>;
const blank = (id: string): MediaRow => ({ id, kind: id.startsWith('NV-') ? 'product' : 'slide', title: '', description: '', image_url: null, enabled: true, deleted: false, cta: 'discover', sort_order: 0 });
const field = { borderWidth: 1, borderColor: '#D7CDBE', borderRadius: 10, padding: 12, marginTop: 10, color: '#102B62', backgroundColor: '#FFFDF9' } as const;
export default function AdminMedia({ api, onEditingChange, onBusyChange }: { api: Api; onEditingChange?: (editing: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [draft, setDraft] = useState<MediaRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = Boolean(draft);
  useEffect(() => { onEditingChange?.(editing); }, [editing, onEditingChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onEditingChange?.(false); onBusyChange?.(false); }, [onEditingChange, onBusyChange]);
  const backToList = () => {
    if (busy) return;
    if (draft && Platform.OS === 'web' && !window.confirm('မသိမ်းရသေးတဲ့ ပြင်ဆင်မှုတွေကို ပယ်ဖျက်ပြီး ပုံစာရင်းသို့ ပြန်မလား။')) return;
    setDraft(null); setConfirmDelete(false); setError(''); setNotice('');
  };
  const load = useCallback(async () => { const data = await api('/api/admin/media'); setRows(data.media || []); }, [api]);
  useEffect(() => { let active = true; load().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [load]);
  const select = (row: MediaRow) => { if (draft && Platform.OS === 'web' && !window.confirm('မသိမ်းရသေးတဲ့ ပြင်ဆင်မှုတွေကို ပယ်ဖျက်ပြီး ဆက်သွားမလား။')) return; setDraft({ ...row }); setError(''); setNotice(''); setConfirmDelete(false); };
  const button = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" disabled={busy || loading} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 9, backgroundColor: '#102B62', marginTop: 8, opacity: busy || loading ? 0.5 : 1 }}><Text style={{ color: '#FFFDF9', fontWeight: '700' }}>{label}</Text></Pressable>;
  const upload = () => {
    if (!draft || Platform.OS !== 'web' || busy) return;
    const id = draft.id;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      setError(''); setNotice('');
      if (file.size > 2 * 1024 * 1024) { setError(`ပုံအရွယ်အစား ${(file.size / 1024 / 1024).toFixed(2)} MB ဖြစ်နေပါတယ်။ 2 MB အောက်ပုံ ရွေးပေးပါ။`); return; }
      setBusy(true);
      try {
        // iPhone Files can return an empty or generic MIME type for valid images.
        // Detect the actual file bytes and give FileReader the correct image type.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const png = [137, 80, 78, 71, 13, 10, 26, 10];
        const mime = png.every((value, index) => bytes[index] === value) ? 'image/png'
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
          : bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80 ? 'image/webp' : '';
        if (!mime) throw new Error('ဒီဖိုင်က PNG / JPEG / WebP ပုံ မဟုတ်ပါ။ HEIC ပုံဆိုရင် JPEG အဖြစ် ပြောင်းပြီး ရွေးပေးပါ။');
        const imageFile = new Blob([bytes], { type: mime });
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('ဖိုင်ဖတ်မရပါ။')); reader.readAsDataURL(imageFile); });
        const data = await api('/api/admin/media', 'POST', { action: 'upload', id, dataUrl });
        setDraft(old => old?.id === id ? { ...old, image_url: data.image_url, deleted: false } : old);
        setNotice('ပုံတင်ပြီးပါပြီ။ Website မှာ ပြဖို့ Save နှိပ်ပါ။');
      } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }; input.click();
  };
  const save = async (deleting = false) => {
    if (!draft) return; setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/admin/media', 'POST', { ...draft, action: deleting ? 'delete' : 'save' });
      await load(); setDraft(null); setConfirmDelete(false);
      setNotice(deleting ? 'Website မှာ ဒီပုံကို မပြတော့ပါ။' : 'သိမ်းပြီးပါပြီ။ Website မှာ စက္ကန့် ၃၀ အတွင်း ပြောင်းပါမယ်။');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <View style={{ paddingVertical: 12 }}><Text style={{ fontSize: 20, color: '#102B62', fontWeight: '700' }}>Slides & Product Photos</Text><Text style={{ color: '#746B60', marginTop: 8 }}>Slide ပုံများနှင့် NV code တစ်ခုချင်းစီရဲ့ ပုံကို ဒီနေရာမှာ ပြင်နိုင်ပါတယ်။ Upload လုပ်ပြီး Save နှိပ်ပါ။</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: '#9E3F35', padding: 12 }}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={{ color: '#355F3C', padding: 12 }}>{notice}</Text> : null}
    {loading ? <Text>ပုံစာရင်း ဖတ်နေပါတယ်…</Text> : null}
    {!draft ? <>
      {button('+ Slide အသစ်', () => select(blank(`slide-${Date.now()}`)))}
      {rows.filter(r => r.kind === 'slide' && !r.deleted).map(row => <View key={row.id} style={field}>{row.image_url ? <Image source={{ uri: row.image_url }} style={{ width: '100%', height: 130 }} resizeMode="contain" /> : null}<Text>{row.title} · {row.enabled ? 'Published' : 'Hidden'} · #{row.sort_order}</Text>{button('Edit / Delete', () => select(row))}</View>)}
      <Text style={{ fontSize: 18, marginTop: 20, color: '#102B62' }}>Product Photos · NV-001–NV-032</Text>
      {novaCatalog.map(product => { const row = rows.find(r => r.id === product.id); return <View key={product.id} style={field}><Text>{product.id} — {product.name}</Text><Text>{row?.deleted ? 'ပုံဖျက်ထားသည်' : row?.image_url ? 'သိမ်းထားသောပုံ' : 'မူလပုံ'}</Text>{button('ပုံတင် / ပြင် / ဖျက်', () => select(row || blank(product.id)))}</View>; })}
    </> : <View style={field}>
      {button('← ပုံစာရင်းသို့ ပြန်မယ်', backToList)}
      <Text style={{ fontWeight: '700' }}>{draft.id} · {draft.kind === 'product' ? novaCatalog.find(p => p.id === draft.id)?.name : 'Slide'}</Text>
      {draft.image_url ? <Image source={{ uri: draft.image_url }} style={{ width: '100%', height: 190 }} resizeMode="contain" /> : <Text style={{ marginTop: 12 }}>ပုံရွေးပေးပါ။</Text>}
      {button(busy ? 'ခဏစောင့်ပါ…' : 'Upload / Replace photo', upload)}
      {draft.kind === 'slide' ? <>
        <TextInput accessibilityLabel="Slide title" placeholder="Slide ခေါင်းစဉ်" maxLength={90} value={draft.title} editable={!busy} onChangeText={title => setDraft({ ...draft, title })} style={field}/>
        <TextInput accessibilityLabel="Slide description" placeholder="ရှင်းလင်းချက်" maxLength={500} multiline value={draft.description} editable={!busy} onChangeText={description => setDraft({ ...draft, description })} style={field}/>
        <TextInput accessibilityLabel="Slide position" placeholder="အစဉ်နံပါတ်" keyboardType="number-pad" value={String(draft.sort_order)} editable={!busy} onChangeText={v => setDraft({ ...draft, sort_order: Number(v.replace(/\D/g, '')) || 0 })} style={field}/>
        {button(draft.cta === 'discover' ? 'CTA: Collection → AI Agent ပြောင်းမယ်' : 'CTA: AI Agent → Collection ပြောင်းမယ်', () => setDraft({ ...draft, cta: draft.cta === 'discover' ? 'advisor' : 'discover' }))}
      </> : null}
      {button(draft.enabled ? 'Published · ဖျောက်မယ်' : 'Hidden · ပြမယ်', () => setDraft({ ...draft, enabled: !draft.enabled }))}
      {button('Save', () => save())}
      {button(confirmDelete ? 'ဖျက်ရန် အတည်ပြုမယ်' : 'Delete', () => confirmDelete ? save(true) : setConfirmDelete(true))}
      {button('Cancel / ပုံစာရင်းသို့ ပြန်မယ်', backToList)}
    </View>}
  </View>;
}

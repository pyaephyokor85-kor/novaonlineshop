import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { downloadSlipBlob, exportSlipPdf, renderOrderSlip, shareSlip } from './lib/order-slip.mjs';
import { printBleRaster } from './lib/web-bluetooth-print.mjs';
export default function OrderSlip({ order, close }: { order: any; close: () => void }) {
  const [page, setPage] = useState(0);
  const [slip, setSlip] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setSlip(null); setError(''); setNotice('');
    renderOrderSlip(order,80).then((value: any) => { if(active) setSlip(value); }).catch((e: Error) => { if(active) setError(e.message); });
    return () => { active = false; };
  }, [order]);
  const action = async (task: () => Promise<any> | void, message = '') => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); setNotice(message); }
    catch (e: any) { if(e.name !== 'AbortError') setError(e.message || 'လုပ်ဆောင်မှု မအောင်မြင်ပါ။'); }
    finally { setBusy(false); }
  };
  const button = (label: string, task: () => void) => <Pressable accessibilityRole="button" disabled={!slip || busy} onPress={task} style={{ padding:14, borderRadius:10, backgroundColor:'#102B62', opacity:!slip||busy?0.5:1, margin:4, minHeight:44 }}><Text style={{ color:'#FFFDF9',fontWeight:'700' }}>{label}</Text></Pressable>;
  const current = slip?.pages?.[page] || slip;
  const print = () => {
    const direct = Boolean((navigator as any).bluetooth && globalThis.isSecureContext);
    return action(() => direct ? printBleRaster(current.canvas) : shareSlip(current), direct ? 'Printer ဆီ data ပို့ပြီးပါပြီ။ စာရွက်ထွက်မထွက် စစ်ပေးပါ။' : 'Thermer ထဲမှာ printer နဲ့ စာရွက်အရွယ်ရွေးပြီး Print နှိပ်ပါ။');
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if(!busy) close(); }}><View style={{ flex:1,backgroundColor:'#FBF7EF',paddingTop:18 }}>
    <View style={{ padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center' }}><Text style={{ fontSize:22,fontWeight:'700',color:'#102B62' }}>NOVA Delivery Slip</Text><Pressable disabled={busy} onPress={close} style={{ padding:12 }}><Text>Close ✕</Text></Pressable></View>
    <Text style={{ paddingHorizontal:16,fontWeight:'700',color:'#102B62' }}>Paper: 80 × 110 mm</Text>
    {slip?.pages?.length > 1 ? <View style={{ flexDirection:'row',flexWrap:'wrap',padding:12 }}>{slip.pages.map((_: any,index: number) => <Pressable key={index} disabled={busy} onPress={() => setPage(index)} style={{ padding:12,backgroundColor:page===index?'#E8C977':'#EEE8DF',margin:4 }}><Text>စာမျက်နှာ {index+1}</Text></Pressable>)}</View> : null}
    <Text style={{ padding:12,color:'#746B60' }}>iPhone: Print → Share ထဲက Thermer ကိုရွေးပါ။ စာရွက်အရွယ် 80 × 110 mm ရွေးပါ။ စာမျက်နှာများရင် Print / PNG ကို တစ်ရွက်ချင်းရွေးပါ။</Text>
    {error ? <Text accessibilityRole="alert" style={{ padding:12,color:'#9E3F35' }}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={{ padding:12,color:'#355F3C' }}>{notice}</Text> : null}
    <ScrollView contentContainerStyle={{ alignItems:'center',padding:12 }} style={{ flex:1 }}>{slip ? <Image accessibilityLabel="NOVA order slip preview" source={{ uri:current.dataUrl }} style={{ width:'100%',maxWidth:384,aspectRatio:current.canvas.width/current.canvas.height,backgroundColor:'white' }} resizeMode="contain"/> : !error ? <ActivityIndicator/> : null}</ScrollView>
    <View style={{ flexDirection:'row',flexWrap:'wrap',padding:8 }}>
      {button(busy?'ခဏစောင့်ပါ…':'Print / Bluetooth',print)}
      {button('Share → Thermer',() => action(() => shareSlip(current)))}
      {button('Save PDF',() => action(() => exportSlipPdf(slip)))}
      {button('Save PNG',() => action(() => downloadSlipBlob(current.png,`${current.filename}.png`)))}
    </View>
  </View></Modal>;
}

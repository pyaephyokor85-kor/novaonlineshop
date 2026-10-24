import { useState } from 'react';
import { SafeAreaView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

export default function AdminLogin({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError('');
    if (!email.trim() || !password) { setError('Enter your authorized staff email and password.'); return; }
    setBusy(true);
    try { await onLogin(email.trim(), password); }
    catch (problem: any) { setError(problem?.message || 'Staff sign-in failed.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView className="flex-1 bg-nova-cream"><ScrollView contentContainerClassName="items-center px-7 pb-12 pt-14"><View className="w-full max-w-md rounded-[24px] border border-[#EFE7DD] bg-nova-paper p-6 shadow-xl"><Text className="text-[10px] font-bold tracking-[2px] text-nova-clay">NOVA · PRIVATE PREVIEW</Text><Text className="mt-3 text-[25px] font-semibold text-nova-ink">Staff sign-in</Text><Text className="mt-2 text-xs leading-5 text-nova-muted">Use an existing NOVA staff account. Access is checked again by the server; guest access is disabled here.</Text><TextInput value={email} onChangeText={setEmail} placeholder="Staff email" placeholderTextColor="#A39A91" keyboardType="email-address" autoCapitalize="none" className="mt-5 rounded-xl bg-[#F3EEE7] px-4 py-3.5 text-[13px] text-nova-ink"/><TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#A39A91" secureTextEntry className="mt-2 rounded-xl bg-[#F3EEE7] px-4 py-3.5 text-[13px] text-nova-ink"/><Pressable onPress={submit} disabled={busy} className="mt-4 items-center rounded-xl bg-nova-ink py-4 active:opacity-80"><Text className="text-[13px] font-bold text-[#F7EEE3]">{busy ? 'Please wait…' : 'Sign in to Preview admin'}</Text></Pressable>{error ? <Text accessibilityRole="alert" className="mt-4 text-[11px] leading-4 text-[#A35F4B]">{error}</Text> : null}</View></ScrollView></SafeAreaView>;
}

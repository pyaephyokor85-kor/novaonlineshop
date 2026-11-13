import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, Text, View, Pressable } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AdminConsole from './AdminConsole';
import AdminLogin from './AdminLogin';

const url = process.env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const client = url && anonKey ? createClient(url, anonKey, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

export default function AdminRoute() {
  const [userId, setUserId] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [retry, setRetry] = useState(0);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    let active = true;
    const subscription = client?.auth.onAuthStateChange((_event, session) => { if (active) setUserId(session?.user.id || ''); }).data.subscription;
    client?.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id || ''); }).catch(() => { if (active) setUserId(''); }).finally(() => { if (active) setBooting(false); });
    if (!client) setBooting(false);
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
  useEffect(() => {
    let active = true;
    setAuthorized(false); setAccessError('');
    if (!userId) return;
    setCheckingAccess(true);
    (async () => {
      try {
        const { data } = await client!.auth.getSession();
        const response = await fetch('/api/admin/orders', { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.orders)) throw new Error(result.error || 'Admin ခွင့်ပြုချက် အတည်မပြုနိုင်ပါ။');
        if (active) setAuthorized(true);
      } catch (e: any) { if (active) setAccessError(e.message); }
      finally { if (active) setCheckingAccess(false); }
    })();
    return () => { active = false; };
  }, [userId, retry]);
  const login = async (email: string, password: string) => {
    if (!client) throw new Error('Staff sign-in is not configured for this Preview.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('No active staff session was returned.');
    setUserId(data.session.user.id);
  };
  const signOut = async () => { await client?.auth.signOut(); setUserId(''); };
  if (Platform.OS !== 'web') return <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FBF7EF' }}><Text>Admin Preview is available on the web.</Text></SafeAreaView>;
  if (booting) return <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FBF7EF' }}><ActivityIndicator color="#946D25"/><Text style={{ color: '#746B60', marginTop: 10 }}>Checking staff session…</Text></SafeAreaView>;
  if (userId && !authorized) return <SafeAreaView style={{ flex: 1, padding: 28, backgroundColor: '#FBF7EF' }}><Text style={{ color: '#102B62', fontSize: 24 }}>NOVA Admin</Text><Text accessibilityRole="alert" style={{ marginTop: 20, color: '#9E3F35' }}>{checkingAccess || !accessError ? 'Admin ခွင့်ပြုချက် စစ်နေပါတယ်…' : accessError}</Text>{accessError ? <Pressable onPress={() => setRetry(n => n + 1)} style={{ padding: 16 }}><Text>ပြန်စစ်မယ်</Text></Pressable> : null}<Pressable onPress={signOut} style={{ padding: 16 }}><Text>Sign out / အကောင့်ပြောင်းမယ်</Text></Pressable></SafeAreaView>;
  return userId && authorized ? <AdminConsole authClient={client} onSignOut={signOut}/> : <AdminLogin onLogin={login}/>;
}

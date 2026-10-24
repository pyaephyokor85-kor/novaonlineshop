import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, Text, View } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AdminConsole from './AdminConsole';
import AdminLogin from './AdminLogin';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const client = url && anonKey ? createClient(url, anonKey, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

export default function AdminRoute() {
  const [userId, setUserId] = useState('');
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    let active = true;
    const subscription = client?.auth.onAuthStateChange((_event, session) => { if (active) setUserId(session?.user.id || ''); }).data.subscription;
    client?.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id || ''); }).catch(() => { if (active) setUserId(''); }).finally(() => { if (active) setBooting(false); });
    if (!client) setBooting(false);
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
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
  return userId ? <AdminConsole authClient={client} onSignOut={signOut}/> : <AdminLogin onLogin={login}/>;
}

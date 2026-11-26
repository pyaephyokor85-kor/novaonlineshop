import { useEffect, useState } from 'react';
import { Text } from 'react-native';

export default function AdminCostStudio({ api }: { api: (path: string, method?: string, body?: unknown) => Promise<any> }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/api/admin/orders?view=cost-studio')
      .then(data => { if (active) setHtml(data.html); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [api]);
  if (error) return <Text accessibilityRole="alert">{error}</Text>;
  if (!html) return <Text>Cost Studio ဖွင့်နေပါတယ်…</Text>;
  return <iframe title="NOVA Cost Studio" srcDoc={html} onLoad={event => {
    const frame = event.currentTarget.contentWindow;
    if (frame) Object.assign(frame, { syncLedger: (revision?: number, ledger?: unknown) =>
      api('/api/admin/orders?view=cost-studio-sync', revision === undefined ? 'GET' : 'POST', revision === undefined ? undefined : { revision, ledger }) });
  }} style={{ width: '100%', height: '80vh', border: 0 }} />;
}

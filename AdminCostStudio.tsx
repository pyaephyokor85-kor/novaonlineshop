import { useEffect, useState } from 'react';
import { Text } from 'react-native';

export default function AdminCostStudio({ api }: { api: (path: string) => Promise<{ html: string }> }) {
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
  return <iframe title="NOVA Cost Studio" srcDoc={html} style={{ width: '100%', height: '80vh', border: 0 }} />;
}

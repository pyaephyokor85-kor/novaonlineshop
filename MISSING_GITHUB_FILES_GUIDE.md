# NOVA Missing GitHub Files

ဒီ bundle ထဲက folders/files တွေကို GitHub repository root ထဲ upload လုပ်ပါ။

```text
api/
├── scent-advisor.mjs
└── order-notification.mjs

data/
├── nova-catalog.json
├── nova-catalog.ts
├── catalog-import-report.json
└── image-import-report.json

public/
└── manus-routes.json

supabase/
└── schema.sql
```

## Upload လုပ်နည်း

1. ZIP ကို download လုပ်ပြီး Extract/Unzip လုပ်ပါ။
2. Extract folder ထဲက `api`, `data`, `public`, `supabase` folders ကို ရွေးပါ။
3. GitHub repository `novaonlineshop` ကိုဖွင့်ပါ။
4. **Add file → Upload files** ကိုနှိပ်ပါ။
5. Folders တွေကို upload လုပ်ပါ။
6. Commit message ကို `Add NOVA catalog, API, route manifest and Supabase schema` လို့ရေးပြီး **Commit changes** နှိပ်ပါ။

GitHub root မှာ `package.json` နဲ့အတူ `api/`, `data/`, `public/`, `supabase/` တန်းတူရှိရပါမယ်။ Folder အတွင်း folder နှစ်ထပ် မဖြစ်စေပါနဲ့။

ပြီးရင် Vercel မှာ **Deployments → Redeploy** လုပ်ပါ။

Do not upload `.env`, API keys, `node_modules`, `dist`, or `.expo`.

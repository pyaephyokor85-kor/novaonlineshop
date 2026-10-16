# NOVA Perfume — Supabase Account အသစ် Setup လမ်းညွှန်

Manus Gmail/Vercel Gmail နှင့် သီးခြား Gmail တစ်ခုကို Supabase အတွက် သုံးနိုင်ပါတယ်။ Supabase project အသစ်က NOVA customer login, fragrance profiles နှင့် purchase history ကို သီးခြားသိမ်းပါမယ်။

## 1. Supabase account အသစ်ဖန်တီးခြင်း

1. https://supabase.com/dashboard သို့သွားပါ။
2. Vercel/Manus account မဟုတ်သော သီးခြား Gmail ဖြင့် Sign in လုပ်ပါ။
3. **New project** ကိုနှိပ်ပါ။
4. Project name ကို `nova-perfume` ဟုထားနိုင်ပါတယ်။
5. Database password ကို ခိုင်မာသော password သတ်မှတ်ပြီး လုံခြုံစွာ သိမ်းပါ။
6. Region ကို customer များနှင့် နီးစပ်ရာ region ရွေးပါ။
7. Project ဖန်တီးပြီး Ready ဖြစ်သည်အထိ စောင့်ပါ။

## 2. NOVA schema ထည့်ခြင်း

Supabase project အသစ်ထဲတွင်:

1. **SQL Editor → New query** ကိုဖွင့်ပါ။
2. Repository ထဲရှိ `supabase/schema.sql` ဖိုင်တစ်ခုလုံးကို copy/paste လုပ်ပါ။
3. **Run** နှိပ်ပါ။

Schema က အောက်ပါ table များကို ဖန်တီးပါမယ်:

- `fragrance_profiles` — customer တစ်ဦးချင်းစီ၏ scent profile
- `fragrance_purchases` — customer purchase history
- RLS policies — user တစ်ဦးက မိမိ data ကိုသာ ဖတ်/ရေးနိုင်ရန်
- New auth user အတွက် empty profile auto-create trigger

## 3. Schema အောင်မြင်/မအောင်မြင် စစ်ခြင်း

**Table Editor** ထဲတွင် အောက်ပါ table နှစ်ခု ပေါ်ရပါမယ်:

```text
fragrance_profiles
fragrance_purchases
```

SQL Editor တွင်လည်း စစ်နိုင်ပါတယ်:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('fragrance_profiles', 'fragrance_purchases')
order by table_name;
```

## 4. Project URL နှင့် public key ရယူခြင်း

Supabase: **Project Settings → API**

- Project URL ကို copy လုပ်ပါ
- `anon public` သို့မဟုတ် `Publishable key` ကို copy လုပ်ပါ
- `service_role` key ကို မသုံးပါနှင့်၊ မမျှဝေပါနှင့်

ဤနှစ်ခုသည် project တစ်ခုတည်းက ဖြစ်ရပါမယ်:

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_NEW_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_NEW_PROJECT_ANON_OR_PUBLISHABLE_KEY
```

## 5. Vercel တွင် ထည့်ခြင်း

Vercel project အသစ်: **Settings → Environment Variables → Add New**

```text
Key: EXPO_PUBLIC_SUPABASE_URL
Value: သင့် Supabase project အသစ်၏ Project URL
Type: Config
Environment: Production (Preview/Development လိုအပ်ပါက ရွေးပါ)
```

```text
Key: EXPO_PUBLIC_SUPABASE_ANON_KEY
Value: project အသစ်၏ anon/public သို့မဟုတ် publishable key
Type: Config
Environment: Production (Preview/Development လိုအပ်ပါက ရွေးပါ)
```

ပြီးရင် **Redeploy** လုပ်ပါ။

## 6. Supabase Auth redirect URL

Vercel domain အသစ်ရပြီးနောက် Supabase: **Authentication → URL Configuration** တွင်:

```text
Site URL:
https://YOUR-VERCEL-DOMAIN.vercel.app

Redirect URLs:
https://YOUR-VERCEL-DOMAIN.vercel.app/*
```

ထည့်ပြီး Save လုပ်ပါ။

## 7. အရေးကြီးသော data အချက်

Supabase project အသစ်သုံးလျှင် customer account, fragrance profile နှင့် purchase history အဟောင်းများ မပါလာပါ။ Customer များကို project အသစ်တွင် ပြန် sign up လုပ်ရပါမယ်။

Product catalog 32 ခုက NOVA website bundle ထဲတွင် ပါပြီးသားဖြစ်သောကြောင့် Supabase ထဲသို့ catalog ကို မဖြစ်မနေ ထည့်ရန်မလိုပါ။ Profile/purchase data ကိုသာ Supabase ထဲတွင် သိမ်းပါမယ်။

## လုံခြုံရေး

- Supabase `service_role` key မထည့်ပါနှင့်။
- OpenAI secret key ကို Supabase သို့မဟုတ် GitHub မတင်ပါနှင့်။
- `.env` ဖိုင်ကို GitHub မတင်ပါနှင့်။
- Key များကို Vercel Environment Variables တွင်သာ ထည့်ပါ။

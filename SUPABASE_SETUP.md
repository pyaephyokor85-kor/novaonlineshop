# NOVA Supabase Cloud Profile Setup

Supabase project မရှိသေးသောကြောင့် cloud storage ကို ယခုအချိန်တွင် active မလုပ်ထားပါ။ ဒီ repository ထဲမှာ schema နှင့် security policy ကို ကြိုတင်ပြင်ထားသည်။

## 1. Create a project

1. Open [supabase.com](https://supabase.com) and create a project.
2. In **Project Settings -> API**, copy the **Project URL** and public **publishable/anon key**.
3. Do not use or share the `service_role` key in the mobile app.

## 2. Create the secure table

Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it.

The schema creates:

- `fragrance_profiles` keyed by the authenticated Supabase user ID
- favorite families, preferred notes, moods, occasions and dislikes
- last recommendation and timestamps
- Row Level Security policies so users can only read/write their own profile
- an Auth trigger that creates an empty profile after signup

## 3. Connect the app

After the project exists, provide the Project URL and public anon/publishable key. The next integration step will:

- replace local session login with Supabase Auth
- use the Supabase user ID instead of the temporary guest profile ID
- upsert the AI-extracted profile after every Advisor response
- load the profile on login and sync it across devices
- add logout, session refresh and password reset

Until those credentials are added, the app intentionally remains in local prototype mode and does not send profile data to a cloud service.

For server-side integrations, see [`SUPABASE_PROFILE_API.md`](./SUPABASE_PROFILE_API.md) for the authenticated `GET/PUT /api/cloud-profile` endpoints.

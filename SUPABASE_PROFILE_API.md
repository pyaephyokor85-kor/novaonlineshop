# NOVA Supabase Profile API

The backend exposes user-scoped profile endpoints. Every request must include a Supabase Auth access token:

```http
Authorization: Bearer <supabase_access_token>
```

The server verifies the token through Supabase Auth and uses the authenticated user ID. A client cannot choose another user's `user_id`.

## Read the signed-in user's profile

```http
GET /api/cloud-profile
Authorization: Bearer <access_token>
```

Response:

```json
{
  "profile": {
    "favoriteFamilies": ["citrus", "woody"],
    "preferredNotes": ["bergamot"],
    "moods": ["fresh"],
    "occasions": ["daytime"],
    "dislikes": ["oud"]
  },
  "user": { "id": "...", "email": "..." }
}
```

## Upsert the signed-in user's profile

```http
PUT /api/cloud-profile
Content-Type: application/json
Authorization: Bearer <supabase_access_token>

{
  "profile": {
    "favoriteFamilies": ["citrus", "woody"],
    "preferredNotes": ["bergamot"],
    "moods": ["fresh"],
    "occasions": ["daytime"],
    "dislikes": ["oud"],
    "lastRecommendation": "NOVA No. 03 — Citrus Fresh"
  }
}
```

The API maps the camelCase app model to the snake_case Supabase table columns and writes with the user's token. Supabase Row Level Security remains the final ownership boundary.

## Required setup

1. Run [`supabase/schema.sql`](./supabase/schema.sql) in Supabase SQL Editor.
2. Start the backend with `npm run api`; it loads `.env` using Node's `--env-file` support.
3. Keep only the public Supabase key in the app. Never put a secret/service-role key in `App.tsx` or `.env` values exposed to Expo.

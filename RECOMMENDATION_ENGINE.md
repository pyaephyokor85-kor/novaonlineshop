# NOVA Profile-Based Recommendation Engine

## Recommendation flow

1. The Advisor receives the customer's message, current profile and purchase history.
2. `inferProfile()` extracts new families, notes, moods, occasions and dislikes.
3. The updated profile is merged with the existing local or cloud profile.
4. `seasonContext()` determines the current seasonal trend set.
5. `rankProducts()` scores only the NOVA catalog using profile, season and purchase evidence.
6. Products matching a dislike are blocked with a strong negative score.
7. The ranked candidates and seasonal context are passed to the LLM as a constrained recommendation context.
8. The API returns both the natural-language answer and structured recommendation cards.
9. The updated profile is synced to Supabase for signed-in customers. Signed-in purchase history is loaded from Supabase before Advisor requests.

## Scoring

Matching fragrance family adds **+4** per match. Matching a preferred note adds **+3** per match. A seasonal family match adds **+2**, and a seasonal note match adds **+1**. A previous purchase of the same product adds **+2** per purchase, a previously purchased family adds **+2**, and a purchase within the last 180 days adds **+1**. Any disliked family or note applies **-100** and sets `blocked: true`. Ties fall back to the NOVA catalog order.

## Seasonal signals

Winter favors amber, woody and oud families with sandalwood, vanilla and amber notes. Spring favors floral, musk and fresh families with rose, white musk and neroli. Summer favors citrus, fresh and floral families with bergamot, neroli and cedar. Autumn favors amber, woody and leathery families with amber, sandalwood and black pepper.

The LLM receives these signals and can explain a recommendation as a refill, a complementary alternative or a seasonal fit. Disliked notes still block a product regardless of seasonal or purchase signals.

## API response shape

`POST /api/scent-advisor` now returns:

```json
{
  "reply": "...",
  "profile": { "favoriteFamilies": [], "preferredNotes": [], "moods": [], "occasions": [], "dislikes": [] },
  "seasonalContext": {
    "season": "autumn",
    "label": "polished, grounded autumn scents",
    "families": ["amber", "woody", "leathery"],
    "notes": ["amber", "sandalwood", "black pepper"]
  },
  "purchaseHistoryCount": 2,
  "recommendations": [
    {
      "id": "03",
      "name": "NOVA No. 03",
      "family": ["citrus", "fresh"],
      "notes": ["bergamot", "neroli", "cedar"],
      "price": "$75",
      "score": 11,
      "matchedFamilies": ["citrus", "fresh"],
      "matchedNotes": ["bergamot"],
      "seasonalMatches": ["fresh", "bergamot"],
      "purchaseMatches": 0,
      "blocked": false
    }
  ]
}
```

The Advisor UI renders seasonal and purchase-history rationale on the profile-curated cards.

## Purchase history API

Signed-in customers can use `GET /api/cloud-purchases` to load their own history and `POST /api/cloud-purchases` to add a purchase. Both endpoints require a Supabase Auth bearer token. The `fragrance_purchases` table and RLS policies are included in [`supabase/schema.sql`](./supabase/schema.sql).

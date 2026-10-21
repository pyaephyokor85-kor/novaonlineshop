# NOVA Online Shop

Expo / React Native perfume storefront: 32 products, a scent advisor, optional Supabase accounts, and order requests sent to Telegram.

## Run locally

Use **Node.js 22** (matching `.nvmrc`):

```sh
npm ci
cp .env.example .env
npm run api
```

In a second terminal, run `npm run web`. For local web, set `EXPO_PUBLIC_API_URL=http://localhost:8787` in `.env` and restart Expo after changing public variables. On a physical phone, use your computer's reachable LAN IP instead of `localhost`, or a deployed HTTPS API URL.

Guests can browse without credentials. Guest preferences stay on that device and survive tab changes/restarts. Product images are bundled from the repository instead of temporary external URLs.

## Accounts and cloud profiles

Create a Supabase project, run `supabase/schema.sql` in its SQL editor, enable email/password authentication, and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Confirm the signup email if required, then log in. A signup without a valid session does not sign the user in.

Never put service-role keys, Telegram tokens, or AI keys in `EXPO_PUBLIC_` variables: those values are bundled into the client. Cloud profile/purchase reads rely on the schema's row-level-security policies. Live Supabase/email integration has not been configured or tested by these code fixes.

## Order requests

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` **on the API server only**, and ensure the bot can post to the chat. Missing configuration returns an error rather than accepting an order silently.

The API uses catalog names/prices, rejects unknown products, and accepts integer quantities from 1 to 99. Success/errors appear in the UI on web and mobile. Success means Telegram accepted an **order request**, not that stock was reserved, payment taken, or delivery confirmed. Contact the customer to confirm availability, delivery fees, and payment.

## Scent advisor

Without an AI key, catalog-based recommendations still work. Optionally set server-only `OPENAI_API_KEY`, `OPENAI_API_BASE`, and `LLM_MODEL`. Local and Vercel APIs share the same advisor handler. Disliked products are excluded from ranking and the AI prompt.

Preference extraction is rule-based English matching. Burmese fallback replies are supported, but full Burmese preference extraction is not implemented.

## Vercel web deployment

The repository's `vercel.json` exports the single-page app to `dist`; `api/*.mjs` provides serverless endpoints. Leave `EXPO_PUBLIC_API_URL` empty for same-origin `/api` calls. Set the public Supabase variables and server-only Telegram/AI settings in Vercel, then rebuild. `server.mjs` is a separate local Node server, not a Vercel function.

These changes do not deploy a production site. Review the changes and environment configuration before merging/deploying.

## Checks

```sh
npm run typecheck
npm test
npm run build:web
npx expo install --check
```

Tests mock external services or start a local server with empty credentials; no real orders, Telegram notifications, or paid AI calls are made. Web export is verified. Native Android/iOS builds and live email/Telegram integrations still need device/account testing.

## Before real customer orders

This is an order-request prototype, not a complete transaction system. Add durable order storage/IDs/statuses, stock management, shipping rules, payment verification, admin access, and privacy/return policies. Add persistent rate limiting and abuse protection before exposing anonymous order/AI endpoints publicly. Client duplicate prevention is not server-side idempotency. Legacy local `/api/profile/:id` routes are unauthenticated convenience endpoints, not a private production profile service; guest preferences now stay in client storage.

The Expo SDK 51 dependency tree is old. The installed lockfile's audit reported **64 findings (43 high, 1 critical)**, including build tooling/transitive packages; this does not mean every finding is exploitable in the deployed storefront. A supported Expo/React Native upgrade and security review remain necessary. Do not blindly run `npm audit fix --force`: proposed major changes can break this app.

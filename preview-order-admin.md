# NOVA Preview admin and Thermer receipt test

This branch is for the isolated NOVA Preview environment. NOVA Production, its branch, domains, data, and credentials must remain unchanged. The current printer rollout may use only the existing fake QA order; do not create another order or change status, stock, or discount for this test.

## Existing Preview administration

The `preview/admin-order-management` branch uses the separate Preview Supabase URL and anon key (`EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL` and `EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_ANON_KEY`). Server reads use `NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY`, and staff APIs verify the Bearer session against `NOVA_ADMIN_EMAILS`. Keep these scoped to Preview; never expose service-role credentials through an `EXPO_PUBLIC_` variable. Existing legacy Supabase values are not changed by the printer rollout.

Orders preserve their saved size, unit price, subtotal, discount, COD total, and status. Base prices remain 10ml = 15,000 Ks and 30ml = 35,000 Ks. Delivery is excluded and confirmed separately. Stock and milliliters are separate manual balances; printing must never adjust either. The existing Receipt and Address label actions retain their browser print fallback and the latest upstream page-height fixes.

## Thermer 80mm handoff

**Thermer 80mm** makes an authenticated POST to `/api/admin/print-ticket`. A second direct **Open Thermer** tap opens `bprint://https://<isolated-relay-preview>/api/receipt?token=...`. The app fetches that separate relay rather than the protected NOVA Preview domain. Thermer Browser Print must be enabled and paper set to 80mm. The web page cannot confirm physical printer success.

The main print service fails closed unless `VERCEL_ENV=preview`, `NOVA_ORDER_STORAGE_ENABLED=true`, and `NOVA_THERMER_PRINT_ENABLED=true`. It requires the explicit Preview Supabase URL/service-role key, staff allowlist, dedicated random server-only `NOVA_PRINT_TOKEN_SECRET`, and `NOVA_THERMER_RELAY_URL`. The three new Thermer environment values are scoped only to Preview and `preview/admin-order-management`. No legacy/Production database credential fallback is allowed.

Both ticket issuance and receipt retrieval are restricted in code to order **NOVA-261027-9F8B1A**, customer **FAKE QA 10ML - DO NOT SHIP**. Other orders are rejected. This is intentionally not a general customer-receipt rollout.

## Isolated relay and protection

The separate Vercel project is `nova-thermer-relay-preview`. Its deployed code permits only the Preview environment with `NOVA_THERMER_RELAY_ENABLED=true`. The only functional public API is GET `/api/receipt`; it has no shop UI, admin, database credentials, arbitrary proxy target, or static source directory.

NOVA retains Vercel Authentication. Add only the relay project as a Trusted Source, with **relay Preview → NOVA Preview**. Remove the default Production and Development mappings before saving. The relay obtains its short-lived Vercel OIDC token per request and sends `x-vercel-trusted-oidc-idp-token` to the fixed NOVA Preview `/api/print-response` URL. No automation-bypass secret is created or placed in a URL.

Only the isolated relay's exact Preview hostname may have a Deployment Protection Exception. Never add an exception for NOVA Preview or switch off its project-wide protection. The relay hostname is deliberately dedicated to this API; a domain exception is not path-specific, so do not add other applications or sensitive assets to this project.

The relay fixes its upstream URL, rejects redirects and unexpected query parameters, limits time/body size, and accepts only the expected numeric-keyed text receipt JSON. It does not forward user cookies or Authorization headers. Both services return UTF-8 JSON with no-store/nosniff/no-referrer and no wildcard CORS. Native app fetching normally does not require browser CORS.

## Ticket and receipt safety

The HMAC capability ticket is scoped to one order and lasts 120 seconds. It contains no customer details or staff token, but possession grants receipt access during that period. It is reusable until expiry, not one-time. This code does not log it; infrastructure/access logs may still capture URL queries, so do not share links and keep this rollout fake-data-only. One-use behavior or broader real-order use needs a separate review.

The JSON is a numeric-keyed object matching the supplied PHP `JSON_FORCE_OBJECT` example, with text-only type-0 entries. Saved financial values are checked rather than repriced. Invalid snapshots fail closed. Delivery addresses, idempotency keys, staff history, inventory, and other orders are excluded. Markup, printer controls, and bidi controls are neutralized while Unicode is preserved. Myanmar glyph output still depends on Thermer/printer settings and a physical test.

## Test and rollback

Use the existing fake order: Blue Essence / NV-001 / 10ml × 1; subtotal 15,000 Ks; discount 10% = 1,500 Ks; COD total 13,500 Ks; delivery excluded. Local tests use a synthetic UUID/timestamp, not a newly created database row. Read-only integration checks and the owner's iPhone print must use this same existing order.

Verify invalid/expired tickets fail, the exact relay route returns the fake receipt, anonymous NOVA Preview remains protected, and relay source/static paths return no sensitive content. Do not launch Thermer automatically from a server test. The owner should prepare a fresh ticket and tap Open Thermer once on the iPhone.

To stop printing, disable `NOVA_THERMER_PRINT_ENABLED` on the approved Preview branch and redeploy Preview, remove the relay Trusted Source, and remove its own domain exception. Do not change NOVA Production. Rotate the dedicated signing key if a link or key is suspected exposed.

# NOVA Preview: order admin, stock, discounts, and printing

This is an uncommitted candidate based on the current live source. It has not been deployed or connected to any database. Production and existing customer data have not been changed.

## Before testing

1. Create or select a **separate Preview Supabase project**. Do not reuse the Production project. Create the authorized staff login accounts there and confirm the web app's `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` point to that Preview project.
2. Apply `supabase/order-management-preview.sql` only to that isolated Preview project. It creates order, status-history, inventory-adjustment, and discount-setting tables. The initial discount setting is **off at 0%**. Do not run this SQL on Production or a database containing live orders.
3. In Preview server environment settings only, set `NOVA_ORDER_STORAGE_ENABLED=true`, `SUPABASE_URL` to the Preview project URL, `SUPABASE_SERVICE_ROLE_KEY` to its server-only key, and `NOVA_ADMIN_EMAILS` to the comma-separated staff email allowlist. The service-role key must never use an `EXPO_PUBLIC_` variable or appear in the app bundle. Leave the flag false until the Preview database is migrated and the allowlist is ready.
4. For a deployed web Preview, leave `EXPO_PUBLIC_API_URL` blank so the app uses same-origin `/api` routes. For a local server or phone test, set it to that Preview server's reachable address. Telegram credentials are optional in this mode: the database order is saved first; the API response indicates whether a Telegram notification was sent.
5. Build a separate Preview from this candidate only after review. The admin route is the web Preview URL plus `/admin`; each API request verifies the signed-in account and checks its email against `NOVA_ADMIN_EMAILS`.

## What the controls do

- **Orders:** new submissions enter `waiting`, then staff can move them through `confirmed`, `packing`, and `delivery`. Waiting, confirmed, or packing orders may be cancelled. Status changes and staff identity/reason are audited; delivered and cancelled orders are terminal. Repeated submissions with the same request key do not create duplicate orders.
- **Prices and discounts:** the base prices remain **10ml = 15,000 Ks** and **30ml = 35,000 Ks** for every catalog scent, with **COD**. The discount is a reversible, shop-wide percentage from 0% to 100% (up to two decimal places); it starts disabled at 0%. If enabled, it applies to the merchandise subtotal, with the discount rounded to the nearest whole Kyat. The server/database calculate the final amount; the client never supplies a trusted price or discount. Each order stores its own size, unit price, subtotal, discount percentage/amount, COD total, and status, so later discount changes do not reprice old orders. Delivery fee is not included and is confirmed separately.
- **Stock / ml:** units and milliliters are separate manual balances. Staff can add or subtract values with a required reason. Negative balances are rejected and each adjustment records the signed change, previous/new balance, reason, staff, and time. Orders do not automatically deduct stock.
- **Receipt and address sticker:** the admin opens a browser/device print dialog and chooses an 80mm or 110mm CSS paper width. Receipts show the saved order snapshot, discount (if any), COD total, and that delivery is excluded. The address sticker uses a 100mm-tall layout at the selected width. The printer driver must be configured to match the roll. This is **browser/device print-dialog support only**; it is not verified direct thermal-printer hardware integration, ESC/POS control, or a guarantee that a particular iPhone/printer pairing will print correctly.

## Safe Preview test

Use only obviously fake customer names, phone numbers, and addresses. Test a 10ml and a 30ml order, verify the fixed subtotal and COD total, enable a small discount and verify that a new order snapshots it, then disable it and confirm the next order returns to base pricing. Try repeated submission with the same request, check the order queue and status history, make a +1 unit and +5ml adjustment, and verify a below-zero adjustment is rejected. Use test data only when printing receipts or labels at both widths; check the print dialog and the selected driver size. Do not submit a real customer order or print a real address while testing.

## Fail-closed behavior and boundaries

With `NOVA_ORDER_STORAGE_ENABLED=false` (the example/default), all admin APIs return unavailable, the public discount preview is 0%/off, and the existing Telegram-only COD notification path remains in place. If the Preview project, server-only service key, or migration is missing while storage is enabled, order persistence fails rather than silently saving data locally. Staff authorization is checked server-side. This change has not applied SQL, created staff accounts, requested secrets, submitted orders, committed, pushed, merged, or deployed anything.

The SQL contains the current fixed price values as server-side database checks. If the owner later changes the base prices, update the live pricing file, this Preview migration/RPC, and price tests together before using the feature.

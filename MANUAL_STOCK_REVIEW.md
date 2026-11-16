# Manual bottle stock and daily order review

Admin → Stock In / Out records manual bottle movements per scent and 10ml/30ml. No order or status change automatically alters stock. Quantities stay private; 1–10 is Low Stock, zero is Out of Stock, missing variants are Not set. Legacy unsized units and liquid ml remain separate and unmodified.

Admin → Orders → နေ့စဉ်စာရင်းပိတ်ကြည့်ရန် opens the daily list. Dates use Asia/Yangon midnight boundaries. View opening + in − out = closing, dated movements with reason/admin/optional order number, and all orders created that day. CSV export includes all three lists. This is a live review, not an immutable accounting close. Historical order statuses are current statuses; merchandise totals exclude cancellations and delivery and are not payment receipts.

Opening quantities must be physically counted and entered manually per size. The app deliberately does not infer size splits from legacy stock.

## Rollout

- Branch: feat/manual-stock-daily-close-20261116
- Apply supabase/manual-stock-daily.sql only once per target database, initially on the isolated NOVA Preview project. It adds two tables and two service-role-only invoker RPCs. No existing orders, stock tables, or status triggers are changed.
- The shared inventory API handles view=bottles / view=daily and adjust_bottle after existing staff authorization. Function count remains 12.
- Before production release, identify the exact database used by production server configuration (preview-prefixed settings currently have precedence). Apply the additive SQL there only after owner approval; do not assume the database name identifies the active target.
- Never expose server credentials or grant stock table access to anon/authenticated.

## Validation

- Existing plus new Node tests; TypeScript and Expo build.
- tests/manual-stock-db.sql: run only on isolated Preview. It tests size isolation, duplicate retries, oversell rollback, unchanged order count, and Myanmar midnight boundaries; all data fixtures are rolled back.
- Security verification: RLS enabled; anon/authenticated cannot select tables or execute the RPCs. New functions use SECURITY INVOKER.
- Local browser automation could not launch in this environment (Chromium socket permission failure). No claim of completed mobile visual or authenticated browser end-to-end verification.
- Existing Preview security advisor INFO for RLS/no policy is intentional for service-only tables. Existing Auth leaked-password warning is unrelated to this change.

# Shared budgets: one-time setup

Plan works fully offline. Sharing budgets and syncing across devices needs a (free) Supabase project.
Budget contents are encrypted before upload; the keys are kept with each account so any signed-in device can open them.

## 1. Create the project

1. Create a project at <https://supabase.com/dashboard>.
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](../supabase/schema.sql) and run it.
3. **Project Settings → API**: copy the Project URL and the `anon` / publishable key into `.env`
   (copy `.env.example`), then restart `npx expo start`.

## 2. Redirect URLs

**Authentication → URL Configuration → Redirect URLs**, add:

- `dearplan://**` (Android / iOS app builds)
- `exp://**` (Expo Go during development)
- `http://localhost:8081/**` (web during development) and your deployed web URL, if any

## 3. Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID → Web application**.
2. Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Google**: enable, paste the client ID and secret.

## 4. Sign in with Apple (optional, needs a paid Apple Developer account)

Hidden in the app by default. To turn it on later, complete this section and set
`APPLE_SIGN_IN_ENABLED = true` in `src/cloud/config.ts`.

- **iOS app (native):** Apple Developer → Identifiers → your App ID (`com.dearplan.app`) → enable *Sign in with Apple*.
  Supabase → Authentication → Providers → Apple: enable and add `com.dearplan.app` to **Client IDs**
  (add `host.exp.Exponent` too if you test in Expo Go).
- **Web / Android (OAuth):** also create a Services ID + key in Apple Developer and enter them in the same
  Supabase provider page (see Supabase's "Login with Apple" guide). Apple requires the secret to be renewed every 6 months.

Native Apple sign-in needs a real iPhone (the Simulator can't complete it).

## How the encryption works

Budgets are encrypted, but not end-to-end: each person's identity key is kept on their account (`profiles`,
`kdf = {"alg":"none"}`), readable only through row-level security, so any device they sign in on unlocks by itself.
There's no separate encryption password. The privacy policy says plainly that the operator could technically read
budgets.

| Piece | Where it lives | Protection |
| --- | --- | --- |
| Budgets on your device | AsyncStorage | XChaCha20-Poly1305 with a device key in the iOS Keychain / Android Keystore |
| Login session | AsyncStorage | Same device-key encryption |
| Your identity key (X25519) | Keychain / Keystore, and `profiles` on the account | Row-level security (owner only) |
| Shared budget | `shared_budgets.ciphertext` | XChaCha20-Poly1305 with a random per-budget key, bound to the budget id |
| Budget key per member | `budget_members.wrapped_key` | Sealed to that member's public key (X25519 + HKDF-SHA256) |

- Row-level security limits who can download each budget; removing a member rotates its key.
- Accounts made when Plan still had encryption passwords are asked for that password once on a new device, then
  move over automatically (also on any device that's already unlocked). If they forgot it, *Forgot it?* starts fresh:
  budgets on that device carry over; the rest stay locked and open again if the old password is entered under
  Account (`supabase/010_previous_keys.sql` keeps the old key backups for this).
- The web build stores its device key in the browser's localStorage (browsers have no Keychain), so on the web
  the at-rest encryption protects against stolen storage blobs but not someone with access to that browser profile.

## Email sign-in

- **Sign up:** email and a password (at least 8 characters). If **Authentication → Providers → Email → Confirm
  email** is on, people must click a link before their first sign-in; turn it off for an instant start.
- **Sign in:** email and password, no code.
- **Forgot password:** a 6-digit code is emailed (the "Magic Link" template must include `{{ .Token }}`); it signs
  them in and they choose a new password. People who signed up when Plan used codes only use this once to set one.
- Supabase's built-in email sender allows only a few emails an hour. Add your own SMTP (e.g. Resend) under
  **Authentication → Emails → SMTP Settings** before launch.

## Sync behaviour

Edits push about 1.5 s after you stop typing; other devices update live (Supabase Realtime) and also
check every minute and whenever the app comes to the foreground. If two people edit at once, changes are
merged item by item (transactions, categories, assigned amounts…); if both changed the same item, the
last device to save keeps its version.

Your name, companion and notification choices aren't part of a shared budget (each member keeps their own), so
they're saved separately to your account, encrypted, and follow you to every device. Run
`supabase/009_personal_settings.sql` once to turn this on; until then they stay on each device.

## Apple Pay auto-logging (optional)

Lets an iPhone Shortcuts automation log every Apple Pay payment into Plan.

1. In the Supabase SQL editor, run `supabase/003_payment_inbox.sql`, then `supabase/009_log_payment_flexible.sql`
   (accepts the shortcut's fields in any capitalisation; without it, "Amount" instead of "amount" silently fails).
   Then run `supabase/014_all_free.sql`: transit taps (SimplyGo and other tap-in/tap-out fares) arrive with no
   amount and are skipped instead of showing "Automation failed"; the fare is logged when it's actually charged.
   Every feature is free, so there's no Pro check.
2. In the app: Settings → Automation → Apple Pay auto-log, then follow the steps. It creates a personal key and
   shows the address and fields to paste into the Shortcut, plus a test button.

Payments wait in `payment_inbox` (amount, merchant, card name only, not encrypted) until the app claims and
deletes them on its next sync.

## Screenshot capture (optional)

A "Scan Payment" Shortcut screenshots a payment confirmation and sends it to the `scan-payment` Edge Function,
which asks Claude to read the amount and merchant and puts the result in the same payment inbox. Uses the
inbox key from above.

1. Run `supabase/003_payment_inbox.sql` (if you haven't), then `supabase/004_screenshot_scan.sql` and
   `supabase/008_scan_details.sql` (lets shortcut scans carry a suggested category, the date and the card used).
2. Store the Claude credentials as function secrets (never in `.env` or the app):

   ```bash
   supabase secrets set ANTHROPIC_AUTH_TOKEN=<your gateway key> ANTHROPIC_BASE_URL=https://llm-gateway.aisg.sg/ ANTHROPIC_MODEL=claude-sonnet-4-6
   ```

   For the regular Anthropic API, set `ANTHROPIC_API_KEY` instead and leave out the base URL.
3. Deploy without JWT checks (the inbox key is the auth): `supabase functions deploy scan-payment --no-verify-jwt`
4. In the app: Settings → Automation → Screenshot capture.

Each user gets 30 scans a day (`SCAN_DAILY_LIMIT` secret to change it). Screenshots aren't stored.

## Notifications and reminders (optional, free)

Web push for the web app: Android, desktop browsers, and iPhone/iPad from iOS 16.4 once Plan is added to the
Home Screen. Each device works out its own reminders (bills due, payments to review, money to assign,
overspending, a daily nudge, a monthly recap) and uploads only the times and short, generic text.

1. Run `supabase/006_reminders.sql`.
2. Make a key pair once: `npx web-push generate-vapid-keys`.
3. Function secrets, then deploy:

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<any long random string>
   supabase functions deploy send-reminders --no-verify-jwt
   ```

4. Put the public key in `.env` as `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, and rebuild the web app.
5. Turn on the pg_cron and pg_net extensions, fill in your project URL and `CRON_SECRET` in the cron block at the
   bottom of `006_reminders.sql`, and run it.
6. For a notification the moment Apple Pay or a scan logs a payment, run `supabase/010_instant_push.sql` and fill
   in the two settings at its bottom (the function URL and the same `CRON_SECRET`).
   Then `supabase/011_push_currency.sql`, so amounts show in your currency ("S$61.93", not "61.93").
7. In the app: Settings → Notifications.

Checking it works (SQL editor):

```sql
select count(*) from public.push_subscriptions;                                         -- your devices
select send_at, title from public.reminders order by send_at limit 5;                   -- what's queued
select status_code, content from net._http_response order by created desc limit 5;      -- what the function replied
```

`{"error": …}` in the replies names what's missing (keys, `VAPID_SUBJECT`); `"errors"` lists what Apple/Google refused.

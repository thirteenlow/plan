# Shared budgets: one-time setup

Plan works fully offline. Sharing budgets and syncing across devices needs a (free) Supabase project.
Budget contents are end-to-end encrypted, so Supabase only ever stores ciphertext.

## 1. Create the project

1. Create a project at <https://supabase.com/dashboard>.
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](../supabase/schema.sql) and run it.
3. **Project Settings → API**: copy the Project URL and the `anon` / publishable key into `.env`
   (copy `.env.example`), then restart `npx expo start`.

## 2. Redirect URLs

**Authentication → URL Configuration → Redirect URLs**, add:

- `planbudget://**` (Android / iOS app builds)
- `exp://**` (Expo Go during development)
- `http://localhost:8081/**` (web during development) and your deployed web URL, if any

## 3. Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID → Web application**.
2. Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Google**: enable, paste the client ID and secret.

## 4. Sign in with Apple (optional, needs a paid Apple Developer account)

Hidden in the app by default. To turn it on later, complete this section and set
`APPLE_SIGN_IN_ENABLED = true` in `src/cloud/config.ts`.

- **iOS app (native):** Apple Developer → Identifiers → your App ID (`com.planbudget.app`) → enable *Sign in with Apple*.
  Supabase → Authentication → Providers → Apple: enable and add `com.planbudget.app` to **Client IDs**
  (add `host.exp.Exponent` too if you test in Expo Go).
- **Web / Android (OAuth):** also create a Services ID + key in Apple Developer and enter them in the same
  Supabase provider page (see Supabase's "Login with Apple" guide). Apple requires the secret to be renewed every 6 months.

Native Apple sign-in needs a real iPhone (the Simulator can't complete it).

## How the encryption works

| Piece | Where it lives | Protection |
| --- | --- | --- |
| Budgets on your device | AsyncStorage | XChaCha20-Poly1305 with a device key in the iOS Keychain / Android Keystore |
| Login session | AsyncStorage | Same device-key encryption |
| Your identity key (X25519) | Keychain / Keystore | Backup on the server is encrypted with your password (scrypt N=2¹⁵) |
| Shared budget | `shared_budgets.ciphertext` | XChaCha20-Poly1305 with a random per-budget key, bound to the budget id |
| Budget key per member | `budget_members.wrapped_key` | Sealed to that member's public key (X25519 + HKDF-SHA256) |

- The server can't decrypt anything; row-level security also limits who can even download the ciphertext.
- Removing a member rotates the budget key so they can't read future changes.
- Forgetting your password: use *Forgot password?* (confirmed with an emailed code) to create new keys. Budgets you own keep syncing from
  devices that still have them; budgets shared with you must be shared again. Data on your devices is never lost.
- The web build stores its device key in the browser's localStorage (browsers have no Keychain), so on the web
  the at-rest encryption protects against stolen storage blobs but not someone with access to that browser profile.

## Sync behaviour

Edits push about 1.5 s after you stop typing; other devices update live (Supabase Realtime) and also
check every minute and whenever the app comes to the foreground. If two people edit at once, changes are
merged item by item (transactions, categories, assigned amounts…); if both changed the same item, the
last device to save keeps its version.

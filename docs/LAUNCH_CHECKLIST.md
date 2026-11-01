# Launch checklist: web app + Android (no Apple fees)

Total cost: **$25 one-time** (Google Play). Everything else is free.

## 1. Supabase (dashboard → your project)

- [ ] **SQL Editor**: run `supabase/schema.sql` (fresh project) — or, if you already ran it before, run
      `supabase/002_account_deletion.sql`.
- [ ] **Authentication → Sign In / Providers → Email**: enabled. Turn **Confirm email** on.
- [ ] **Authentication → Emails → Templates → Magic Link**: make the email show the code. Replace the body with:

      <h2>Your Plan sign-in code</h2>
      <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
      <p>It expires in 1 hour. If you didn't request it, ignore this email.</p>

- [ ] **Custom SMTP (needed before real users)**: Supabase's built-in email is for testing only (very low
      hourly limit, and it may only deliver to your own team's addresses). Free option: a Brevo account
      (free plan) → SMTP & API → create SMTP key; verify your sender email. Then
      **Authentication → Emails → SMTP Settings**: host `smtp-relay.brevo.com`, port `587`, your Brevo login + SMTP key.
- [ ] **Authentication → URL Configuration**:
  - Site URL: your Netlify URL (e.g. `https://dearplan.netlify.app`)
  - Redirect URLs: `https://dearplan.netlify.app/**`, `http://localhost:8081/**`, `planbudget://**`, `exp://**`
- [ ] Free projects pause after ~1 week without activity: unpause from the dashboard if sign-in stops working.

## 2. Web app on Netlify (free)

- [ ] Make sure `.env` has your Supabase URL and **publishable** key.
- [ ] Build: `npm run build:web` (creates the `dist` folder).
- [ ] Go to <https://app.netlify.com/drop>, sign up (free), drag the **`dist`** folder in.
- [ ] Site configuration → change the site name (e.g. `plan-budget`) → your URL becomes `https://dearplan.netlify.app`.
- [ ] Add that URL to Supabase (section 1) and open it on your phone:
  - iPhone (Safari): Share → **Add to Home Screen**
  - Android (Chrome): ⋮ → **Install app**
- [ ] To update later: rebuild and drag `dist` onto *Deploys* in your Netlify site.

Page routing and security headers are included automatically (`public/_redirects`, `public/_headers`).

## 3. Android on Google Play ($25)

- [ ] Create a free Expo account at <https://expo.dev>, then: `npx eas-cli@latest login` and `npx eas-cli@latest init`.
- [ ] Add your Supabase values as EAS environment variables (expo.dev → project → Environment variables),
      or keep them in `.env` when building locally.
- [ ] Test build (installable APK): `npx eas-cli@latest build -p android --profile preview`.
- [ ] Store build: `npx eas-cli@latest build -p android --profile production` (creates an `.aab`).
- [ ] Google Play Console (<https://play.google.com/console>): pay $25, verify your identity, create app **Plan**.
- [ ] Required listing items:
  - Privacy policy URL: `https://dearplan.netlify.app/privacy`
  - Account deletion URL: `https://dearplan.netlify.app/account` (in-app: Settings → Account & sharing → Delete account)
  - Data safety form: email address (account), app activity is not collected; data is encrypted in transit; users can request deletion.
  - App icon (512×512: `public/logo512.png`), screenshots, short and full description.
- [ ] **New personal developer accounts must run a closed test first** (at the time of writing: at least 12 testers
      opted in for 14 days) before you can publish to everyone. Check Play Console for the current rule.

## Package name

The Android package is `com.planbudget.app`. It's permanent once uploaded to Play, so change it in `app.json`
now if you want something else.

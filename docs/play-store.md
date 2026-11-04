# Putting Plan on Google Play

The Android app is a native build of this repo, made in the cloud with EAS. It's the only place the built-in
payment auto-log works (Google Wallet, Samsung Wallet, SimplyGo): Plan reads those notifications itself, so no
MacroDroid is needed.

## Before you start

1. **Google Play developer account.** Sign up at https://play.google.com/console. There's a one-time US$25 fee, and
   Google checks your ID.
2. **12 testers for 14 days.** Personal accounts made after 13 Nov 2023 must run a closed test with at least 12 people
   opted in for 14 days in a row before they can publish. Line up 15–20 friends with Android phones and Gmail
   addresses.

## 1. Make the app in Play Console

1. Play Console › **Create app**. Name: Plan. Default language: English. App, Free.
2. Package name is set by the first upload: `com.planbudget.app` (from `app.json`).

## 2. Build

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile production
```

This makes an `.aab` signed with a key EAS keeps for you. To try it on your own phone first, build an APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

Android blocks notification access for apps installed outside the Play Store until you allow it: Settings › Apps ›
Plan › ⋮ › **Allow restricted settings**.

## 3. Upload the first build

Either upload the `.aab` by hand in Play Console (**Testing › Closed testing › Create release**), or let EAS do it:

1. Make a Google service account key: https://docs.expo.dev/submit/android (follow "Creating a Google Service Account").
2. `npx eas-cli@latest credentials --platform android` and add the key under Service credentials.
3. `npx eas-cli@latest submit --platform android` (the first upload goes to internal testing as a draft).

## 4. Fill in the store listing and app content

Play Console › **Dashboard** lists every task. The ones that matter for Plan:

- **Privacy policy:** `https://dearplan.vercel.app/privacy`
- **Data safety:**
  - Collected: email (account), financial info (budgets, which are end-to-end encrypted and synced), photos (receipt
    scans, sent to the AI to read).
  - Notifications that Plan reads stay on the phone and aren't collected.
  - Data is encrypted in transit, and users can delete their account.
- **App access:** give reviewers a demo login, or say the app works without signing in.
- **Ads:** none. **Target audience:** 18+. **Content rating:** fill in the questionnaire (finance app, no
  objectionable content).
- **Notification access:** the auto-log screen explains what Plan reads before sending people to Android Settings.
  If Google asks, record a short video: Settings › Payment auto-log › Allow notification access.
- **Listing:** short description, full description, 512×512 icon (`assets/icon.png`), a 1024×500 feature graphic,
  and at least 2 phone screenshots.

## 5. Closed test, then production

1. **Testing › Closed testing:** add your testers' emails, roll out the release, and share the opt-in link.
2. After 14 days with 12+ testers opted in, Play Console unlocks **Apply for production**. Answer the questions about
   your test, then roll out to production. Reviews usually take a few days.

## Updates

JavaScript-only changes can go out without a new store build:

```bash
npx eas-cli@latest update --channel production
```

That needs `expo-updates` set up first. Native changes (new native modules, permissions) need a new build and
submission:

```bash
npx eas-cli@latest build --platform android --profile production --auto-submit
```

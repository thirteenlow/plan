# Plan

A zero-based budgeting app for iOS, Android (and web), built with Expo SDK 58 + Expo Router.
A zero-based budgeting app; visual style is soft, minimal and gradient-accented.

## Run it

```bash
npm install
npx expo start          # then press i (iOS simulator), a (Android emulator), w (web)
```

Native modules used (gradients, SVG, fonts, haptics, storage) are all included in Expo Go, so no custom dev build is needed.
To ship: `npx eas-cli@latest build --platform all`.

Checks: `npx tsc --noEmit`, `npx eslint src`, `npx expo-doctor`.

## First run

Onboarding: name & budget → currency/number/date format → pick categories (remove defaults, add extras or your own)
→ add as many accounts as you like (with examples) → assign money with a live “left to assign” counter → done.

## Navigation

Five tabs: **Home → Plan → Spending → Accounts → Reflect**. A translucent **+ Transaction** button floats above the
tab bar on the right of every tab (and on account registers). Each tab's **•••** menu holds its actions plus Settings.

- **Home** — "Name's Plan": to-do checklist (overspent → Cover, money to assign, transactions to approve or categorize),
  pinned categories, and a current goal with a progress ring. The Home tab shows a badge with the to-do count.
- **Plan** — month picker, filter (underfunded / overspent / money available / snoozed), Assigned & Available columns.
- **Spending** — every transaction by date, collapsible Scheduled section, search, and Select mode for bulk
  approve / clear / categorize / delete.
- **Accounts** — collapsible Cash / Credit / Tracking sections, net worth, Add Account (no bank connections).
- **Reflect** — Spending Breakdown, Income vs. Spending (with a "Started Plan" marker), Net Worth and Age of Money
  cards; each opens the full report.

## Features

**Budget**
- Month-by-month budget with **Ready to Assign**, assigned / activity / available per category
- Carryover of positive balances; **cash overspending** is deducted from next month's Ready to Assign,
  **credit overspending** becomes card debt (shown in orange)
- Future-month assignments pull back Ready to Assign in earlier months
- **Targets**: needed for spending (weekly / monthly / yearly / custom-repeat, "set aside" or "refill up to"),
  have a balance of (optionally by date), save monthly; progress bars and underfunded amounts
- **Auto-assign**: underfunded, assigned last month, spent last month, 3-month averages,
  reduce overfunding, reset available, reset assigned
- **Move money** between categories and **cover overspending**
- Filters: underfunded, overspent, money available, snoozed; collapsible groups; category notes; snooze a target for a month
- **Credit card payment categories**: funded card spending moves into the card's payment category automatically
- **Age of Money**
- Manage categories & groups: add, rename, reorder, hide, move between groups, delete (re-assigning history)

**Accounts**
- Budget accounts (checking, savings, cash, credit card, line of credit) and tracking accounts
  (asset, liability, mortgage, loan); net worth card
- Register grouped by date, search, filters (uncleared / unapproved / uncategorized / flagged), cleared toggle
- **Transfers** (categorised automatically when money leaves the budget), **split transactions**, flags, memos
- **Payee memory** auto-fills the last category used
- **Scheduled / repeating transactions** (13 frequencies), entered automatically when due as unapproved;
  upcoming list in each register; approve individually or all at once
- **Reconcile**: confirm cleared balance or create an adjustment; locks reconciled transactions
- Close / reopen / delete accounts

**Reflect (reports)**: spending breakdown (by category, group or payee), spending trends, net worth, income vs expense.

**Settings**: your name, multiple budgets, currency (10 presets) & date format, light/dark/system theme, payee management
(rename, combine, delete), scheduled list, CSV export and import, demo budget.

## Formats (chosen at setup, editable in Settings → Currency & formats)

Currency (28 presets), currency symbol, symbol placement (before / after / hidden), number format
(`1,234.56`, `1.234,56`, `1 234,56`, `1 234.56`, `1'234.56`, no separator), decimal places (0 / 2 / 3) and date format
(day-month-year, month-day-year, year-month-day), with a live preview. Defaults are guessed from the device region.

## Input validation

All rules live in `src/utils/validation.ts`; the UI checks as you type and the store re-checks before saving.

- **Amounts**: cents-style entry — digits fill from the right (1 → 0.01, 10 → 0.10, 100 → 1.00); everything
  else is ignored. Uses the budget's separators and decimal places, max 999,999,999; a minus sign only where it
  makes sense (balances, assigned).
- **Text**: control and invisible characters (zero-width, bidi overrides) stripped, whitespace collapsed,
  length limits per field (names 40–100, memos 200, notes 500, searches 60).
- **Names**: must contain a letter or number; no duplicates (accounts, groups, payees; categories within a group).
- **Dates**: picked from a calendar; transactions 1970 to 5 years ahead; starting balances not in the future;
  one-off target dates not in the past.
- **Stored data**: saved budgets are checked on load and imports are validated; corrupt data is dropped
  instead of crashing the app. There is no SQL database or HTML rendering, so SQL injection and XSS don't apply.

## Launching

See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md): web app on Vercel (free, installable on iPhone and Android)
and Android on Google Play ($25 one-time). Sign-in: Google and email code (Apple is optional and off by default).

## Accounts & sync

When Supabase is configured (`.env`), signing in is required before using the app. Every budget is then saved to
the account automatically (end-to-end encrypted) and synced across devices; sharing just adds people. Signing out
uploads pending changes and clears the device. Without `.env` the app runs fully local (handy for development).
Receipt photos are stored encrypted on the device only. Settings → Import takes an export .zip (or its Plan and Register CSVs) or an older Plan .json backup, and always adds it as a new budget.

## Accounts, sharing & encryption

- **Multiple budgets**: Settings → Budgets (or Home ••• → Switch budget). Each budget is fully separate.
  Rename, share or delete from the list; deleting asks you to type the budget's name.
- **Local encryption**: all data on the device is encrypted at rest with a key in the Keychain / Keystore.
- **Shared budgets**: sign in with Google or an emailed code (Settings → Account & sharing), create a password,
  then share a budget and invite people by email. End-to-end encrypted; see [docs/CLOUD_SETUP.md](docs/CLOUD_SETUP.md)
  for the one-time Supabase setup and the full security design.

## Responsive layout

| Width | Layout |
| --- | --- |
| < 768 (phones) | Bottom tab bar with floating translucent **+ Transaction** button; modals as sheets |
| ≥ 768 (tablets) | Side navigation rail; sheets become centred dialogs |
| ≥ 960 | Two-column account grid |
| ≥ 1100 (tablet landscape, desktop web) | Budget shows a live **inspector panel** beside the category list |

## Structure

```
src/
  cloud/          Supabase auth, E2E-encrypted sync and three-way merge
  security/       Crypto primitives, device key, encrypted storage
  app/            Expo Router routes (tabs + modal screens)
  components/     UI kit (ui.tsx), Screen, Sheet/Picker, Calendar, charts, nav
  engine/         Pure budgeting logic: budget math, targets, auto-assign, reports, scheduling, age of money
  store/          Zustand store (persisted to AsyncStorage), types, seed/demo data
  theme/          Colour tokens (light/dark), fonts, breakpoints
  utils/          Money (milliunits + formatting), dates, icons
```

All amounts are stored as integer **milliunits** (1.00 = 1000) to avoid floating-point drift.
Data lives on the device only; there is no bank sync or server.

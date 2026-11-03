import React from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card, Txt } from '@/components/ui';

/**
 * Privacy policy (Google Play requires a public URL; on the web this is /privacy).
 * Review and adapt before publishing: add your contact email and jurisdiction.
 */
const SECTIONS: [string, string[]][] = [
  [
    'Summary',
    [
      'Plan is a budgeting app. You sign in so your budgets are saved to your account and synced across your devices.',
      'Your budgets are encrypted, but they are not end-to-end encrypted. Like most budgeting apps, we keep the keys with your account so you can sign in on any device without an extra password. This means Plan could technically access your budgets. We don’t look at them, and we only would if the law required it.',
      'We do not sell data, show ads, or use analytics or tracking.',
    ],
  ],
  [
    'Data stored on your device',
    [
      'Your budgets, accounts, transactions and settings are stored on your device and encrypted with a key kept in the iOS Keychain or Android Keystore (on the web, in your browser’s storage).',
    ],
  ],
  [
    'Data stored on our servers',
    [
      'Account: your email address and, if provided by Google, your name, used to sign you in and to let others invite you by email. If you sign up with email, your password is stored by Supabase as a one-way hash; we never see it.',
      'Encryption keys: the keys that open your budgets are stored with your account, readable only through your signed-in account (and by us as the service operator).',
      'Budgets: encrypted data, plus who has access to each budget and when it was last changed.',
      'Personal settings (your name, companion and notification choices): encrypted the same way as your budgets, so they follow you to your other devices.',
      'Tap-to-pay auto-logging (optional): on iPhone your Shortcut sends each Apple Pay payment’s amount, merchant and card name; on Android your MacroDroid automation sends the text of Google or Samsung Wallet’s payment notification (merchant, amount and the card’s last digits). These wait unencrypted, with no other details, until Plan next opens and imports them, then they’re deleted. Turning the feature off deletes anything still waiting.',
      'AI receipt scan (optional): the image you scan is passed to Anthropic’s Claude to read the amount, merchant, date, category and account, and is not stored by us. Scans from inside the app also send the names of your categories and accounts (no amounts or balances) so it can pick from them. Shortcut scans wait in the same way as Apple Pay payments.',
      'Data is hosted by Supabase (our database and sign-in provider). Google processes sign-in if you choose “Continue with Google”.',
    ],
  ],
  [
    'Your choices',
    [
      'Receipt photos stay on the device where you took them and are not uploaded.',
      'Stop sharing or leave a shared budget at any time from the Share screen.',
      'Delete your account from Settings → Account & sharing → Delete account. This permanently removes your account, keys and the budgets you own from our servers. It also clears your data from the device you delete it on.',
      'Export your data any time from Settings → Export.',
    ],
  ],
  ['Security', ['Data is encrypted in transit (HTTPS) and your budgets are also encrypted with XChaCha20-Poly1305 before upload. Access on the server is restricted by row-level security, so other users can only see budgets shared with them.']],
  ['Children', ['Plan is not directed at children under 13.']],
  ['Changes and contact', ['We will update this page if this policy changes. Questions: contact the developer via the app’s store listing.']],
];

export default function PrivacyScreen() {
  return (
    <Screen back="back" title="Privacy policy" subtitle="Plan · last updated 3 November 2026" maxWidth={680}>
      <View style={{ gap: 14 }}>
        {SECTIONS.map(([title, paragraphs]) => (
          <Card key={title} style={{ gap: 8 }}>
            <Txt variant="h3">{title}</Txt>
            {paragraphs.map((p) => (
              <Txt key={p} tone="soft">
                {p}
              </Txt>
            ))}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

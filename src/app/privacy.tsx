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
      'Your budgets are end-to-end encrypted: they are encrypted on your device before upload, and we cannot read them.',
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
      'Account: your email address and, if provided by Google, your name, used to sign you in and to let others invite you by email.',
      'Encryption keys: your public key, and your private key encrypted with your password. We cannot decrypt it.',
      'Budgets: encrypted data we cannot read, plus who has access to each budget and when it was last changed.',
      'Data is hosted by Supabase (our database and sign-in provider). Google processes sign-in if you choose “Continue with Google”.',
    ],
  ],
  [
    'Your choices',
    [
      'Receipt photos stay on the device where you took them and are not uploaded.',
      'Stop sharing or leave a shared budget at any time from the Share screen.',
      'Delete your account from Settings → Account & sharing → Delete account. This permanently removes your account, key backup and the budgets you own from our servers. It also clears your data from the device you delete it on.',
    ],
  ],
  ['Security', ['Data is encrypted in transit (HTTPS) and, for shared budgets, end-to-end with XChaCha20-Poly1305. Access on the server is restricted by row-level security.']],
  ['Children', ['Plan is not directed at children under 13.']],
  ['Changes and contact', ['We will update this page if this policy changes. Questions: contact the developer via the app’s store listing.']],
];

export default function PrivacyScreen() {
  return (
    <Screen back="back" title="Privacy policy" subtitle="Plan · last updated 31 October 2026" maxWidth={680}>
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

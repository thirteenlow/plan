import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { FONT } from '@/theme';
import { Phone, T, Taps, usePhase, W } from './ShortcutMocks';

/*
 * Drawn iPhone screens for the one-tap setup (GetShortcut), copied from the iOS 27 Shortcuts app: the "Set Up
 * Shortcut" sheet an iCloud link opens, "Configure This Shortcut" for each question, and the editor where the
 * automation starts off ("Automation is turned off") and the name menu renames it or changes its icon.
 * Tap points are in screen coordinates below the status bar (W × 400).
 */

const D = { bg: '#000000', sheet: '#1C1C1E', card: '#2C2C2E', key: '#4A4A4C', line: '#38383A', text: '#FFFFFF', soft: '#8E8E93', blue: '#0A84FF', green: '#30D158' };
type Icon = React.ComponentProps<typeof Ionicons>['name'];

/** A shortcut's tile colour and glyph, as it shows in Shortcuts. */
export type ShortcutTile = { color: string; icon: Icon };

const Caption = ({ children, bottom = 12 }: { children: React.ReactNode; bottom?: number }) => (
  <View style={{ position: 'absolute', left: 14, right: 14, bottom, alignItems: 'center' }}>
    <View style={{ backgroundColor: 'rgba(255,159,10,0.92)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3 }}>
      <T size={9} weight="semibold" color="#000">
        {children}
      </T>
    </View>
  </View>
);

const Tile = ({ tile, width, height, name }: { tile: ShortcutTile; width: number; height: number; name?: string }) => (
  <View style={{ width, height, borderRadius: Math.min(width, height) * 0.22, backgroundColor: tile.color, padding: width * 0.09, justifyContent: 'space-between' }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Ionicons name={tile.icon} size={Math.min(width, height) * 0.24} color="#fff" />
      {name && (
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ellipsis-horizontal" size={9} color="#fff" />
        </View>
      )}
    </View>
    {name && (
      <T size={10} weight="semibold" color="#fff">
        {name}
      </T>
    )}
  </View>
);

const Round = ({ icon, size = 26 }: { icon: Icon; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: D.card, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={icon} size={size * 0.5} color={D.text} />
  </View>
);

const BlueButton = ({ label, top }: { label: string; top: number }) => (
  <View style={{ position: 'absolute', left: 14, right: 14, top, height: 32, borderRadius: 16, backgroundColor: D.blue, alignItems: 'center', justifyContent: 'center' }}>
    <T size={11} weight="semibold" color="#fff">
      {label}
    </T>
  </View>
);

/** Step 1: the iCloud link opens Shortcuts' "Set Up Shortcut" sheet. */
export function AddShortcutScreen({ name, tile }: { name: string; tile: ShortcutTile }) {
  return (
    <Phone dark>
      <View style={{ flex: 1, marginTop: 4, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: D.sheet }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10 }}>
          <Round icon="close" />
          <Round icon="share-outline" />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <T size={14} weight="bold" color={D.text}>
            {name}
          </T>
          <T size={9} color={D.soft}>
            Shared 7 November 2026
          </T>
          <View style={{ marginTop: 12 }}>
            <Tile tile={tile} width={120} height={74} name={name} />
          </View>
        </View>
        <View style={{ marginTop: 40, marginHorizontal: 14, gap: 7 }}>
          <T size={9} weight="semibold" color={D.soft}>
            About This Shortcut
          </T>
          {(
            [
              ['mic', `Say “Hey Siri, ${name}” to run`],
              ['watch-outline', 'Appears on Apple Watch'],
              ['lock-closed', 'Can Run When Locked'],
            ] as [Icon, string][]
          ).map(([icon, text]) => (
            <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: D.card, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon} size={10} color={D.text} />
              </View>
              <T size={9} color={D.text}>
                {text}
              </T>
            </View>
          ))}
        </View>
      </View>
      <BlueButton label="Set Up Shortcut" top={330} />
      <Caption bottom={8}>Tap Set Up Shortcut</Caption>
      <Taps points={[{ x: W / 2, y: 300 + 16 }]} />
    </Phone>
  );
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** A dark iPhone keyboard, small. */
function Keyboard() {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 118, backgroundColor: '#2A2A2C', paddingTop: 8, paddingHorizontal: 3, gap: 5 }}>
      {ROWS.map((row, r) => (
        <View key={row} style={{ flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
          {r === 2 && <View style={{ width: 24, height: 22, borderRadius: 4, backgroundColor: D.key }} />}
          {row.split('').map((k) => (
            <View key={k} style={{ width: 18.5, height: 22, borderRadius: 4, backgroundColor: D.key, alignItems: 'center', justifyContent: 'center' }}>
              <T size={9} color={D.text}>
                {k}
              </T>
            </View>
          ))}
          {r === 2 && <View style={{ width: 24, height: 22, borderRadius: 4, backgroundColor: D.key }} />}
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 3 }}>
        <View style={{ width: 36, height: 22, borderRadius: 4, backgroundColor: D.key }} />
        <View style={{ width: 118, height: 22, borderRadius: 4, backgroundColor: D.key }} />
        <View style={{ width: 52, height: 22, borderRadius: 4, backgroundColor: D.key }} />
      </View>
    </View>
  );
}

/**
 * Step 2: "Configure This Shortcut" for the key (tap the box, Paste), then Next. The general shortcuts ask a second
 * question (`ask`): type the answer, then Add Shortcut.
 */
export function QuestionsScreen({ ask }: { ask?: { question: string; answer: string } }) {
  // Key: box tapped (Paste bubble), pasted, Next. Then (general) typing the answer, Done.
  const steps = ask ? 5 : 3;
  const phase = usePhase(steps, 1700);
  const second = !!ask && phase >= 3;
  const value = second ? (phase === 4 ? ask.answer : ask.answer.slice(0, Math.ceil(ask.answer.length / 2))) : phase >= 1 ? '••••••••••••••••••••' : '';
  const typing = phase === 0 || (second && phase === 3);
  const last = phase === steps - 1;
  return (
    <Phone dark>
      <View style={{ flex: 1, marginTop: 4, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: D.sheet }}>
        <View style={{ height: 34, paddingHorizontal: 10, justifyContent: 'center' }}>{second && <Round icon="chevron-back" />}</View>
        <T size={13} weight="bold" color={D.text} style={{ textAlign: 'center' }}>
          Configure This Shortcut
        </T>
        <View style={{ marginTop: 12, paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 9, lineHeight: 12, color: D.text, fontFamily: FONT.medium }}>
            {second ? ask.question : 'Paste your Plan key. Plan copied it for you: tap here, then Paste.'}
          </Text>
        </View>
        <View style={{ marginTop: 8, height: 34, backgroundColor: D.card, justifyContent: 'center', paddingHorizontal: 12 }}>
          <T size={10} color={value ? D.text : D.soft}>
            {value || 'Text'}
          </T>
        </View>
        {phase === 0 && (
          <View style={{ position: 'absolute', left: 10, top: 34 + 17 + 12 + 26 + 8 + 38, flexDirection: 'row', alignItems: 'center', backgroundColor: D.card, borderRadius: 14, paddingHorizontal: 4, height: 26 }}>
            {['Paste', '✦', 'AutoFill'].map((t, i) => (
              <View key={t} style={{ paddingHorizontal: 9, height: 26, justifyContent: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: D.line }}>
                <T size={9.5} color={D.text}>
                  {t}
                </T>
              </View>
            ))}
          </View>
        )}
      </View>
      {typing ? <Keyboard /> : <BlueButton label={ask && !second ? 'Next' : 'Add Shortcut'} top={330} />}
      <Caption bottom={typing ? 124 : 8}>{second ? (last ? 'Tap Add Shortcut' : `Type ${ask.answer}`) : ['Tap the box, then Paste', 'Your key is in', ask ? 'Tap Next' : 'Tap Add Shortcut'][phase]}</Caption>
      {phase === 0 && <Taps points={[{ x: 34, y: 34 + 17 + 12 + 26 + 8 + 38 + 13 }]} />}
      {!typing && phase >= 1 && (phase === 2 || last) && <Taps points={[{ x: W / 2, y: 300 + 16 }]} />}
    </Phone>
  );
}

const Toggle = ({ on }: { on: boolean }) => (
  <View style={{ width: 32, height: 19, borderRadius: 10, backgroundColor: on ? D.green : '#48484A', padding: 2, alignItems: on ? 'flex-end' : 'flex-start' }}>
    <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: '#fff' }} />
  </View>
);

const ICON_CHOICES: ShortcutTile[] = [
  { color: '#30C85A', icon: 'cash' },
  { color: '#0A84FF', icon: 'card' },
  { color: '#F26464', icon: 'bus' },
  { color: '#F7A23B', icon: 'wallet' },
  { color: '#B65CF4', icon: 'airplane' },
  { color: '#F07BD0', icon: 'cart' },
];

/**
 * Step 3: open the shortcut; the trigger sits in a dashed box marked "Automation is turned off" until Automation is
 * switched on. `change`: for the general shortcuts, the app or sender to pick first. Then, optionally, the name menu
 * renames it (`rename`) or changes its icon.
 */
export function TurnOnScreen({ name, tile, trigger, change, rename }: { name: string; tile: ShortcutTile; trigger: { icon: Icon; text: string; value: string }; change?: string; rename?: string }) {
  const phases = [...(change ? ['change'] : []), 'toggle', 'on', 'menu', ...(rename ? ['rename'] : []), 'icon', 'done'] as const;
  const phase = phases[usePhase(phases.length, 1800)];
  const on = !['change', 'toggle'].includes(phase);
  const value = change && phase !== 'change' ? change : trigger.value;
  const named = rename && ['icon', 'done'].includes(phase) ? rename : name;
  const shownTile = phase === 'done' ? ICON_CHOICES[4] : tile;
  return (
    <Phone dark>
      <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
        <Round icon="chevron-back" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: shownTile.color, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={shownTile.icon} size={10} color="#fff" />
          </View>
          <T size={10.5} weight="semibold" color={D.text}>
            {named}
          </T>
          <Ionicons name="chevron-down-circle" size={11} color={D.soft} />
        </View>
        <Round icon="settings-outline" />
      </View>
      <View style={{ marginHorizontal: 8, marginTop: 6, borderRadius: 16, borderWidth: 1.5, borderStyle: on ? 'solid' : 'dashed', borderColor: on ? 'transparent' : '#636366', padding: 6, gap: 6 }}>
        {!on && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: D.card, borderRadius: 12, paddingHorizontal: 9, height: 24 }}>
            <Ionicons name="timer-outline" size={11} color={D.text} />
            <T size={9} color={D.text}>
              Automation is turned off
            </T>
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, paddingHorizontal: 3 }}>
          <Ionicons name={trigger.icon} size={11} color={on ? '#FF453A' : D.soft} />
          <T size={10} weight="semibold" color={D.text}>
            {trigger.text}
          </T>
          <View style={{ backgroundColor: `${D.blue}33`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
            <T size={9} weight="semibold" color={D.blue}>
              {value}
            </T>
          </View>
        </View>
        <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: D.line, paddingHorizontal: 3 }}>
          <T size={9.5} color={D.text}>
            Automation
          </T>
          <Toggle on={on} />
        </View>
      </View>
      {['Text', 'Text'].map((t, i) => (
        <View key={i} style={{ marginHorizontal: 10, marginTop: 8, borderRadius: 12, backgroundColor: D.card, padding: 8, gap: 5, opacity: 0.7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: '#FFCC00' }} />
            <T size={9.5} weight="semibold" color={D.text}>
              {t}
            </T>
          </View>
          <T size={8.5} color={D.soft}>
            {i === 0 ? '••••••••••••••••' : change ?? 'Get contents of URL'}
          </T>
        </View>
      ))}
      {phase === 'menu' && (
        <View style={{ position: 'absolute', left: W / 2 - 70, top: 30 + 34, width: 140, borderRadius: 12, backgroundColor: '#3A3A3C', paddingVertical: 3 }}>
          {(
            [
              ['pencil', 'Rename'],
              ['color-palette-outline', 'Choose Icon'],
              ['share-outline', 'Share'],
              ['information-circle-outline', 'Details'],
            ] as [Icon, string][]
          ).map(([icon, label]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 22 }}>
              <T size={9.5} color={D.text}>
                {label}
              </T>
              <Ionicons name={icon} size={10} color={D.text} />
            </View>
          ))}
        </View>
      )}
      {phase === 'icon' && (
        <View style={{ position: 'absolute', left: 14, right: 14, top: 30 + 150, borderRadius: 14, backgroundColor: D.sheet, padding: 10, gap: 8 }}>
          <T size={10} weight="semibold" color={D.text} style={{ textAlign: 'center' }}>
            Choose Icon
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {ICON_CHOICES.map((c) => (
              <View key={c.icon} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: c.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={c.icon} size={15} color="#fff" />
              </View>
            ))}
          </View>
        </View>
      )}
      <Caption>
        {
          {
            change: `Tap ${trigger.value}, pick ${change}`,
            toggle: 'Turn Automation on',
            on: 'It runs by itself now',
            menu: 'Optional: tap the name for Rename or Choose Icon',
            rename: `Rename it “${rename}”`,
            icon: 'Pick any colour and icon',
            done: 'Make it yours',
          }[phase]
        }
      </Caption>
      {phase === 'change' && <Taps points={[{ x: 150, y: 36 + 6 + 6 + 10 }]} />}
      {phase === 'toggle' && <Taps points={[{ x: W - 30, y: 36 + 6 + 6 + 24 + 6 + 20 + 6 + 14 }]} />}
      {(phase === 'menu' || phase === 'on') && <Taps points={[{ x: W / 2, y: 18 }]} />}
      {phase === 'icon' && <Taps points={[{ x: W / 2 + 12, y: 150 + 30 + 34 }]} />}
    </Phone>
  );
}

/** Step 4: pay as usual; Plan logs it for review. */
export function LoggedScreen({ what }: { what: string }) {
  const phase = usePhase(2, 2000);
  return (
    <Phone dark>
      <View style={{ alignItems: 'center', marginTop: 70, gap: 8 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: D.green, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={30} color="#fff" />
        </View>
        <T size={11} color={D.soft}>
          {what}
        </T>
        <T size={22} weight="bold" color={D.text}>
          S$4.50
        </T>
      </View>
      {phase === 1 && (
        <View style={{ position: 'absolute', left: 10, right: 10, top: 34, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(44,44,46,0.97)', borderRadius: 14, padding: 9 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#9A5CF5', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="wallet" size={12} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <T size={9.5} weight="semibold" color={D.text}>
              Plan
            </T>
            <T size={8.5} color={D.soft}>
              Logged S$4.50 at Kopi Corner. Review in Spending.
            </T>
          </View>
        </View>
      )}
      <Caption>{phase ? 'It’s in Spending to review' : 'Pay as usual'}</Caption>
    </Phone>
  );
}

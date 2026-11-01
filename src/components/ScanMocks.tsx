import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { FONT } from '@/theme';
import { C, Chip, Group, H, LinkScreen, ListRow, Phone, T, Taps, usePhase, W } from './ShortcutMocks';

/*
 * Drawn iPhone screens for the Screenshot Capture guide (same building blocks as the Apple Pay guide).
 */

type Icon = React.ComponentProps<typeof Ionicons>['name'];

const Caption = ({ children, bottom = 18 }: { children: React.ReactNode; bottom?: number }) => (
  <T size={9} color={C.soft} style={{ position: 'absolute', left: 0, right: 0, bottom, textAlign: 'center' }}>
    {children}
  </T>
);

/** Step 1: Shortcuts tab, then +. */
export function NewShortcutScreen() {
  const tiles: [string, string][] = [
    ['Text Last Image', '#8E5CF5'],
    ['Play Music', '#FF2D55'],
    ['Walk Home', '#34C759'],
    ['Water Log', '#0A84FF'],
  ];
  return (
    <Phone>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={16} color={C.blue} />
        </View>
      </View>
      <T size={20} weight="bold" style={{ paddingHorizontal: 14, marginTop: 6, marginBottom: 10 }}>
        Shortcuts
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 }}>
        {tiles.map(([name, color]) => (
          <View key={name} style={{ width: (W - 32) / 2, height: 58, borderRadius: 12, backgroundColor: color, padding: 8, justifyContent: 'flex-end' }}>
            <T size={9} weight="semibold" color="#fff">
              {name}
            </T>
          </View>
        ))}
      </View>
      <View style={{ position: 'absolute', left: 30, right: 30, bottom: 16, height: 44, borderRadius: 22, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
        {(['layers', 'time', 'grid'] as const).map((ic, i) => (
          <View key={ic} style={{ alignItems: 'center' }}>
            <Ionicons name={ic} size={15} color={i === 0 ? C.blue : C.soft} />
            <T size={7.5} color={i === 0 ? C.blue : C.soft}>
              {['Shortcuts', 'Automation', 'Gallery'][i]}
            </T>
          </View>
        ))}
      </View>
      <Taps
        points={[
          { x: 30 + (W - 60) / 6, y: H - 30 - 38 },
          { x: W - 27, y: 13 },
        ]}
      />
    </Phone>
  );
}

const ACTIONS: [string, Icon, string, string][] = [
  ['Take Screenshot', 'phone-portrait', '#8E8E93', 'Device'],
  ['Get Contents of URL', 'globe', '#34C759', 'Web'],
];

/** Step 2: search and add Take Screenshot, then Get Contents of URL. */
export function AddActionsScreen() {
  const [s, setS] = useState({ q: 0, typed: 0 });
  useEffect(() => {
    const done = s.q === ACTIONS.length;
    const len = done ? 0 : ACTIONS[s.q][0].length;
    const t = setTimeout(
      () => setS(done ? { q: 0, typed: 0 } : s.typed >= len + 14 ? { q: s.q + 1, typed: 0 } : { q: s.q, typed: s.typed + 1 }),
      done ? 2800 : s.typed === 0 ? 500 : 80,
    );
    return () => clearTimeout(t);
  }, [s]);

  const added = ACTIONS.slice(0, s.q);
  const editor = (
    <Group style={{ marginTop: 4 }}>
      {added.map(([t, ic, color], i) => (
        <ListRow key={t} icon={ic} color={color} title={t} last={i === added.length - 1} right={<View />} />
      ))}
    </Group>
  );
  if (s.q === ACTIONS.length) {
    return (
      <Phone>
        <T size={12} weight="semibold" style={{ textAlign: 'center', marginTop: 4, marginBottom: 6 }}>
          New Shortcut
        </T>
        {editor}
        <Caption>Both actions added</Caption>
      </Phone>
    );
  }
  const [q, ic, color, sub] = ACTIONS[s.q];
  const shown = q.slice(0, Math.min(s.typed, q.length));
  const found = s.typed >= q.length;
  const top = 4 + (added.length ? added.length * 35 + 12 : 0);
  return (
    <Phone>
      {added.length > 0 && editor}
      <View style={{ marginHorizontal: 12, marginTop: added.length ? 12 : 4, borderRadius: 10, backgroundColor: '#E4E4EA', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 28 }}>
        <Ionicons name="search" size={12} color={C.soft} />
        <T size={10.5} color={shown ? C.text : C.soft}>
          {shown || 'Search for apps and actions'}
        </T>
      </View>
      <Group style={{ marginTop: 12, opacity: found ? 1 : 0.25 }}>
        <ListRow icon={ic} color={color} title={q} sub={sub} last />
      </Group>
      <Caption>{`Action ${s.q + 1} of ${ACTIONS.length}: ${q}`}</Caption>
      {found && <Taps key={s.q} points={[{ x: 90, y: top + 28 + 12 + 18 }]} />}
    </Phone>
  );
}

/** Step 3: same as the Apple Pay link step, with a Form body. */
export const ScanLinkScreen = () => <LinkScreen title="New Shortcut" body="Form" />;

/** Step 4: token as Text (paste the key), image as File (the Screenshot). */
export function ScanFieldsScreen() {
  const phase = usePhase(6, 1600);
  const fields: [string, React.ReactNode][] = [];
  if (phase >= 2)
    fields.push([
      'token',
      <T key="t" size={8.5} color={C.soft}>
        {phase === 2 ? 'paste your key' : 'Xk29…'}
      </T>,
    ]);
  if (phase >= 4) fields.push(['image', phase === 4 ? <View key="i" style={{ width: 40, height: 12, borderRadius: 3, borderWidth: 1, borderColor: C.blue }} /> : <Chip key="i" label="Screenshot" />]);
  const top = 10;
  const addY = top + 30 + fields.length * 30 + 15;
  const menu = phase === 1 || phase === 3;
  const tap = [
    { x: 70, y: addY },
    { x: 100, y: addY + 24 },
    { x: 170, y: top + 30 + 15 },
    { x: 100, y: addY + 45 },
    { x: W / 2, y: H - 30 - 104 },
  ][phase];
  return (
    <Phone>
      <Group style={{ marginTop: top }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 30, paddingHorizontal: 10 }}>
          <T size={10}>Request Body</T>
          <T size={10} color={C.blue} weight="semibold">
            Form
          </T>
        </View>
        {fields.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <Ionicons name="remove-circle" size={12} color="#FF3B30" />
            <T size={9.5} style={{ width: 52 }}>
              {k}
            </T>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>{v}</View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.line }}>
          <Ionicons name="add-circle" size={12} color={C.green} />
          <T size={9.5}>Add new field</T>
        </View>
      </Group>
      {menu && (
        <View style={{ position: 'absolute', left: 50, top: 30 + addY + 8, width: 110, backgroundColor: C.card, borderRadius: 10, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 6 }}>
          {['Text', 'File'].map((o, i) => {
            const pick = (phase === 1 && i === 0) || (phase === 3 && i === 1);
            return (
              <T key={o} size={10} weight={pick ? 'semibold' : 'medium'} color={pick ? C.blue : C.text} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
                {o}
              </T>
            );
          })}
        </View>
      )}
      {phase === 4 && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, backgroundColor: '#D1D3D9' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, backgroundColor: '#E9EAEE' }}>
            <Chip label="Screenshot" />
          </View>
        </View>
      )}
      <Caption bottom={phase === 4 ? 128 : 18}>{['Add new field', 'Choose Text, name it token', 'Paste your key', 'Add new field, choose File, name it image', 'Tap the value, then Screenshot', 'Both fields done'][phase]}</Caption>
      {phase < 5 && <Taps key={phase} points={[tap]} />}
    </Phone>
  );
}

/** Step 5: rename the shortcut to Scan Payment and tap Done. */
export function NameScreen() {
  const phase = usePhase(4, 1600);
  const name = phase >= 2 ? 'Scan Payment' : 'New Shortcut';
  return (
    <Phone>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, height: 26 }}>
        <View style={{ width: 30 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <T size={11.5} weight="semibold">
            {name}
          </T>
          <Ionicons name="chevron-down-circle" size={11} color={C.soft} />
        </View>
        <T size={10.5} weight="semibold" color={C.blue}>
          Done
        </T>
      </View>
      {phase === 1 && (
        <View style={{ position: 'absolute', left: W / 2 - 60, top: 30 + 28, width: 120, backgroundColor: C.card, borderRadius: 10, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 6 }}>
          {['Rename', 'Choose Icon', 'Move'].map((o, i) => (
            <T key={o} size={10} weight={i === 0 ? 'semibold' : 'medium'} color={i === 0 ? C.blue : C.text} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
              {o}
            </T>
          ))}
        </View>
      )}
      <Group style={{ marginTop: phase === 1 ? 80 : 10 }}>
        {ACTIONS.map(([t, ic, color], i) => (
          <ListRow key={t} icon={ic} color={color} title={t} last={i === ACTIONS.length - 1} right={<View />} />
        ))}
      </Group>
      <Caption>{['Tap the name', 'Rename', 'Call it Scan Payment', 'Tap Done'][phase]}</Caption>
      {phase !== 2 && <Taps key={phase} points={[[{ x: W / 2, y: 13 }, { x: W / 2 - 30, y: 28 + 14 }, { x: 0, y: 0 }, { x: W - 26, y: 13 }][phase]]} />}
    </Phone>
  );
}

type Page = { title: string; rows?: [string, Icon, string, string?][]; tap: number; custom?: React.ReactNode; tapAt?: { x: number; y: number } };

const BACK_TAP: Page[] = [
  {
    title: 'Settings',
    rows: [
      ['General', 'settings', '#8E8E93'],
      ['Accessibility', 'accessibility', C.blue],
      ['Action Button', 'radio-button-on', C.blue],
      ['Wallpaper', 'image', '#30B0C7'],
    ],
    tap: 1,
  },
  {
    title: 'Accessibility',
    rows: [
      ['VoiceOver', 'mic', '#1C1C1E'],
      ['Zoom', 'search', '#1C1C1E'],
      ['Display & Text Size', 'text', C.blue],
      ['Motion', 'move', C.green],
      ['Touch', 'hand-left', C.blue],
    ],
    tap: 4,
  },
  {
    title: 'Touch',
    rows: [
      ['AssistiveTouch', 'ellipse', '#8E8E93', 'Off'],
      ['Haptic Touch', 'finger-print', '#8E8E93'],
      ['Back Tap', 'phone-portrait', C.blue, 'Off'],
    ],
    tap: 2,
  },
  {
    title: 'Back Tap',
    rows: [
      ['Double Tap', 'hand-left', '#8E8E93', 'None'],
      ['Triple Tap', 'hand-left', '#8E8E93', 'None'],
    ],
    tap: 1,
  },
  {
    title: 'Triple Tap',
    rows: [
      ['None', 'close', '#8E8E93'],
      ['Screenshot', 'crop', '#8E8E93'],
      ['Shake', 'phone-portrait', '#8E8E93'],
      ['Scan Payment', 'layers', '#5E5CE6', '✓'],
    ],
    tap: 3,
  },
];

const ACTION_BUTTON: Page[] = [
  { ...BACK_TAP[0], tap: 2 },
  {
    title: 'Action Button',
    tap: -1,
    tapAt: { x: W / 2, y: 250 },
    custom: (
      <View style={{ alignItems: 'center', marginTop: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Ionicons name="chevron-back" size={14} color={C.soft} />
          <View style={{ width: 92, height: 150, borderRadius: 18, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="layers" size={30} color="#5E5CE6" />
          </View>
          <Ionicons name="chevron-forward" size={14} color={C.soft} />
        </View>
        <T size={13} weight="bold">
          Shortcut
        </T>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i === 5 ? C.text : '#C4C4C8' }} />
          ))}
        </View>
        <View style={{ backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 }}>
          <T size={10} color={C.blue} weight="semibold">
            Choose a Shortcut…
          </T>
        </View>
      </View>
    ),
  },
  {
    title: 'Shortcut',
    rows: [
      ['Text Last Image', 'layers', '#8E5CF5'],
      ['Play Music', 'layers', '#FF2D55'],
      ['Scan Payment', 'layers', '#5E5CE6', '✓'],
    ],
    tap: 2,
  },
];

/** Step 6: the Settings path for Back Tap or the Action Button. */
export function ActivationScreen({ mode }: { mode: 'backTap' | 'actionButton' }) {
  const pages = mode === 'backTap' ? BACK_TAP : ACTION_BUTTON;
  const phase = usePhase(pages.length, 1900);
  const p = pages[phase];
  const tap = p.tapAt ?? { x: 90, y: 28 + 6 + p.tap * 35 + 17 };
  return (
    <Phone>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 28, paddingHorizontal: 12 }}>
        <Ionicons name="chevron-back" size={15} color={phase ? C.blue : 'transparent'} />
        <T size={12} weight="semibold" style={{ flex: 1, textAlign: 'center', marginRight: 15 }}>
          {p.title}
        </T>
      </View>
      {p.custom ?? (
        <Group style={{ marginTop: 6 }}>
          {p.rows!.map(([t, ic, color, value], i) => (
            <ListRow
              key={t}
              icon={ic}
              color={color}
              title={t}
              last={i === p.rows!.length - 1}
              right={
                value === '✓' ? (
                  <Ionicons name="checkmark" size={13} color={C.blue} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    {!!value && (
                      <T size={9} color={C.soft}>
                        {value}
                      </T>
                    )}
                    <Ionicons name="chevron-forward" size={11} color="#C4C4C8" />
                  </View>
                )
              }
            />
          ))}
        </Group>
      )}
      {phase === 1 && mode === 'actionButton' && <Caption>Swipe to Shortcut</Caption>}
      <Taps key={phase} points={[tap]} />
    </Phone>
  );
}

/** Last step: pay, trigger it on the confirmation screen, and Plan logs it. */
export function AllSetScreen({ mode }: { mode: 'backTap' | 'actionButton' }) {
  const phase = usePhase(3, 1800);
  return (
    <Phone>
      {phase === 2 && (
        <View style={{ position: 'absolute', left: 10, right: 10, top: 34, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: 9, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#5E5CE6', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="layers" size={12} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <T size={9.5} weight="semibold">
              Scan Payment
            </T>
            <T size={8.5} color={C.soft}>
              Logged SGD 12.50 at Grab
            </T>
          </View>
        </View>
      )}
      <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={30} color="#fff" />
        </View>
        <T size={11} color={C.soft}>
          Payment successful
        </T>
        <Text style={{ fontSize: 26, fontFamily: FONT.bold, color: C.text }}>S$12.50</Text>
        <T size={11}>Paid to Grab</T>
      </View>
      <Caption>{['Pay as usual', mode === 'backTap' ? 'Triple-tap the back of your iPhone' : 'Press the Action Button', 'Logged to Plan'][phase]}</Caption>
      {phase === 1 && (mode === 'backTap' ? <Taps points={[{ x: W / 2, y: 300 }]} /> : <Taps points={[{ x: 2, y: 80 }]} />)}
    </Phone>
  );
}

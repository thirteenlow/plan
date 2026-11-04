import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import { FONT } from '@/theme';

/*
 * Drawn (not recorded) iPhone screens for the Apple Pay setup guide. Each mock shows the screen the user
 * should be on, with a pulsing tap marker that moves through the taps for that step.
 */

const native = Platform.OS !== 'web';
export const W = 230;
export const H = 430;
export const C = { bg: '#F2F2F7', card: '#FFFFFF', text: '#111111', soft: '#6B6B70', line: '#E3E3E8', blue: '#0A84FF', green: '#34C759' };

/** Phone outline with a status bar; children fill the screen. */
export function Phone({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <View style={{ width: W + 14, height: H + 14, borderRadius: 38, padding: 7, backgroundColor: '#1C1C1E', alignSelf: 'center' }}>
      <View style={{ flex: 1, borderRadius: 32, overflow: 'hidden', backgroundColor: dark ? '#0B0B0F' : C.bg }}>
        <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 }}>
          <Text style={{ fontSize: 10, fontFamily: FONT.semibold, color: dark ? '#fff' : C.text }}>9:41</Text>
          <View style={{ width: 62, height: 16, borderRadius: 9, backgroundColor: '#000' }} />
          <Ionicons name="battery-full" size={13} color={dark ? '#fff' : C.text} />
        </View>
        {children}
      </View>
    </View>
  );
}

/** Pulsing tap marker that visits each point in turn (x/y in px within the screen). */
export function Taps({ points }: { points: { x: number; y: number }[] }) {
  const [i, setI] = useState(0);
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    pulse.setValue(0);
    const anim = Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: native });
    anim.start(() => setI((n) => (n + 1) % points.length));
    return () => anim.stop();
  }, [i, pulse, points.length]);
  const p = points[i % points.length];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: p.x - 22, top: p.y - 22 + 30, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 2,
          borderColor: '#FF9F0A',
          opacity: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.3, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.4] }) }],
        }}
      />
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,159,10,0.85)', borderWidth: 2, borderColor: '#fff' }} />
    </View>
  );
}

/** Slowly scrolls its content up and back, to show "scroll down to find it". */
export function Scroller({ distance, children }: { distance: number; children: React.ReactNode }) {
  const [y] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(y, { toValue: -distance, duration: 1400, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
        Animated.delay(2600),
        Animated.timing(y, { toValue: 0, duration: 600, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y, distance]);
  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

export const T = ({ children, size = 11, weight = 'medium', color = C.text, style }: { children: React.ReactNode; size?: number; weight?: 'medium' | 'semibold' | 'bold'; color?: string; style?: object }) => (
  <Text numberOfLines={1} style={[{ fontSize: size, color, fontFamily: weight === 'bold' ? FONT.bold : weight === 'semibold' ? FONT.semibold : FONT.medium }, style]}>
    {children}
  </Text>
);

export function ListRow({ icon, color, title, sub, right, last }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; title: string; sub?: string; right?: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
      <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={12} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <T size={10.5}>{title}</T>
        {!!sub && (
          <T size={8.5} color={C.soft}>
            {sub}
          </T>
        )}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={11} color="#C4C4C8" />}
    </View>
  );
}

export const Group = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <View style={[{ backgroundColor: C.card, borderRadius: 12, marginHorizontal: 12, overflow: 'hidden' }, style]}>{children}</View>
);

// ---------- Screens, one per step ----------

export function HomeScreen() {
  const apps: [string, React.ComponentProps<typeof Ionicons>['name'], string][] = [
    ['Calendar', 'calendar', '#FF3B30'],
    ['Photos', 'images', '#FF9500'],
    ['Camera', 'camera', '#8E8E93'],
    ['Maps', 'map', '#34C759'],
    ['Wallet', 'wallet', '#1C1C1E'],
    ['Notes', 'document-text', '#FFCC00'],
    ['Shortcuts', 'layers', '#5E5CE6'],
    ['Settings', 'settings', '#8E8E93'],
  ];
  return (
    <Phone dark>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingTop: 14, rowGap: 16 }}>
        {apps.map(([name, icon, color]) => (
          <View key={name} style={{ width: '25%', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={20} color="#fff" />
            </View>
            <T size={8.5} color="#fff">
              {name}
            </T>
          </View>
        ))}
      </View>
      <Taps points={[{ x: 28 + 2 * (W - 28) / 4 + 2, y: 14 + 56 + 16 + 20 }]} />
    </Phone>
  );
}

export function AutomationTabScreen() {
  return (
    <Phone>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={16} color={C.blue} />
        </View>
      </View>
      <T size={20} weight="bold" style={{ paddingHorizontal: 14, marginTop: 6 }}>
        Automation
      </T>
      <T size={10} color={C.soft} style={{ paddingHorizontal: 14, marginTop: 8, marginBottom: 6 }}>
        Personal
      </T>
      <Group>
        <ListRow icon="sunny" color="#FF9500" title="At sunrise, daily" sub="Disabled" />
        <ListRow icon="moon" color="#5E5CE6" title="At sunset, daily" sub="Disabled" last />
      </Group>
      <View style={{ position: 'absolute', left: 30, right: 30, bottom: 16, height: 44, borderRadius: 22, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
        {(['folder', 'time', 'grid'] as const).map((ic, i) => (
          <View key={ic} style={{ alignItems: 'center' }}>
            <Ionicons name={ic} size={15} color={i === 1 ? C.blue : C.soft} />
            <T size={7.5} color={i === 1 ? C.blue : C.soft}>
              {['Library', 'Automation', 'Gallery'][i]}
            </T>
          </View>
        ))}
      </View>
      <Taps
        points={[
          { x: W / 2, y: H - 30 - 38 },
          { x: W - 27, y: 13 },
        ]}
      />
    </Phone>
  );
}

function TriggerScreen() {
  const rows: [string, React.ComponentProps<typeof Ionicons>['name'], string, string][] = [
    ['Time of Day', 'time', '#FF9500', '“At 8:00 AM, weekdays”'],
    ['Alarm', 'alarm', '#FF9500', '“When my alarm is stopped”'],
    ['Wi-Fi', 'wifi', C.blue, '“When my iPhone joins home Wi-Fi”'],
    ['Bluetooth', 'bluetooth', C.blue, '“When it connects to AirPods”'],
    ['App', 'apps', '#8E8E93', '“When an app is opened”'],
    ['Wallet', 'wallet', '#1C1C1E', '“When I tap a Wallet card or pass”'],
    ['Battery Level', 'battery-half', C.green, '“When battery rises above 50%”'],
    ['Charger', 'flash', C.green, '“When connected to power”'],
  ];
  return (
    <Phone>
      <T size={13} weight="bold" style={{ textAlign: 'center', marginTop: 4, marginBottom: 8 }}>
        New Automation
      </T>
      <View style={{ height: H - 60, overflow: 'hidden' }}>
        <Scroller distance={120}>
          <Group>
            {rows.map(([t, ic, color, sub], i) => (
              <ListRow key={t} icon={ic} color={color} title={t} sub={sub} last={i === rows.length - 1} />
            ))}
          </Group>
        </Scroller>
      </View>
      <TapsAfterScroll />
    </Phone>
  );
}

/** For the trigger list: the Wallet row ends up here once the list has scrolled. */
function TapsAfterScroll() {
  return <Taps points={[{ x: 70, y: 30 + 5 * 37 + 20 - 120 }]} />;
}

function CardsScreen() {
  const cards = ['Visa •••• 4821', 'Mastercard •••• 1093', 'Any transaction'];
  return (
    <Phone>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginBottom: 10 }}>
        <Ionicons name="chevron-back" size={15} color={C.blue} />
        <T size={12} weight="semibold">
          Wallet
        </T>
        <View style={{ backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
          <T size={9} weight="semibold" color="#fff">
            Next
          </T>
        </View>
      </View>
      <T size={9} color={C.soft} style={{ paddingHorizontal: 18, marginBottom: 4 }}>
        WHEN I TAP
      </T>
      <Group>
        {cards.map((c, i) => (
          <ListRow key={c} icon="card" color={i === 2 ? '#8E8E93' : i ? '#FF3B30' : C.blue} title={c} last={i === cards.length - 1} right={<Ionicons name="checkmark" size={13} color={C.blue} />} />
        ))}
      </Group>
      <Group style={{ marginTop: 12 }}>
        <ListRow icon="checkmark-circle" color="#8E8E93" title="Run After Confirmation" right={<View />} />
        <ListRow icon="flash" color={C.green} title="Run Immediately" last right={<Ionicons name="checkmark" size={13} color={C.blue} />} />
      </Group>
      <Taps
        points={[
          { x: W - 30, y: 44 + 3 * 37 + 12 + 37 + 16 },
          { x: W - 34, y: 6 },
        ]}
      />
    </Phone>
  );
}

/** Step 5: tap Create New Shortcut on the "When I tap…" screen, then search for the action. */
export function ActionSearchScreen({ title = 'When I tap any of 7…' }: { title?: string }) {
  // -1: the "Get Started" screen with the tap on Create New Shortcut; 0…: typing the search.
  const [typed, setTyped] = useState(-1);
  const q = 'Get Contents of URL';
  useEffect(() => {
    const t = setTimeout(() => setTyped((n) => (n >= q.length + 14 ? -1 : n + 1)), typed === -1 ? 2600 : typed === 0 ? 400 : 90);
    return () => clearTimeout(t);
  }, [typed]);

  if (typed === -1) {
    return (
      <Phone dark>
        <View style={{ paddingHorizontal: 14 }}>
          <T size={15} weight="bold" color="#fff" style={{ marginTop: 6 }}>
            {title}
          </T>
          <T size={10} weight="semibold" color="#fff" style={{ marginTop: 10, marginBottom: 6 }}>
            Get Started ›
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['Create New Shortcut', 'add-circle-outline'],
                ['Unknown Action', 'camera'],
              ] as const
            ).map(([label, icon], i) => (
              <View key={label} style={{ flex: 1, height: 62, borderRadius: 12, backgroundColor: '#2C2C2E', padding: 8, justifyContent: 'space-between', opacity: i ? 0.6 : 1 }}>
                <Ionicons name={icon} size={16} color="#fff" />
                <Text numberOfLines={2} style={{ fontSize: 9, lineHeight: 11, color: '#fff', fontFamily: FONT.semibold }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <T size={10} weight="semibold" color="#fff" style={{ marginTop: 14, marginBottom: 6 }}>
            My Shortcuts ›
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, height: 52, borderRadius: 12, backgroundColor: '#8E5CF5' }} />
            <View style={{ flex: 1, height: 52, borderRadius: 12, backgroundColor: '#E5C100' }} />
          </View>
        </View>
        <Taps points={[{ x: 14 + (W - 36) / 4, y: 6 + 20 + 10 + 18 + 31 }]} />
      </Phone>
    );
  }

  const shown = q.slice(0, Math.min(typed, q.length));
  return (
    <Phone>
      <View style={{ marginHorizontal: 12, marginTop: 4, borderRadius: 10, backgroundColor: '#E4E4EA', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 28 }}>
        <Ionicons name="search" size={12} color={C.soft} />
        <T size={10.5} color={shown ? C.text : C.soft}>
          {shown || 'Search for apps and actions'}
        </T>
      </View>
      <Group style={{ marginTop: 12, opacity: typed >= q.length ? 1 : 0.25 }}>
        <ListRow icon="globe" color="#34C759" title="Get Contents of URL" sub="Web" />
        <ListRow icon="link" color="#34C759" title="URL" sub="Web" last />
      </Group>
      {typed >= q.length && <Taps points={[{ x: 90, y: 4 + 28 + 12 + 18 }]} />}
    </Phone>
  );
}

/** Steps through phases on a timer (looping), for multi-tap animations. */
export function usePhase(count: number, ms = 1700) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => (p + 1) % count), phase === count - 1 ? ms * 1.6 : ms);
    return () => clearTimeout(t);
  }, [phase, count, ms]);
  return phase;
}

export const Chip = ({ label }: { label: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E6F0FF', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
    <Ionicons name="layers" size={8} color={C.blue} />
    <T size={8.5} color={C.blue} weight="semibold">
      {label}
    </T>
  </View>
);

/** Paste the link into the URL box, expand, set Method to POST and Request Body to JSON (or Form). */
export function LinkScreen({ title = 'When I tap my card', body = 'JSON' }: { title?: string; body?: 'JSON' | 'Form' }) {
  const phase = usePhase(4);
  const filled = phase >= 1;
  const expanded = phase >= 2;
  const row = (label: string, value: string, highlight: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 30, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.line }}>
      <T size={10}>{label}</T>
      <T size={10} color={highlight ? C.blue : C.soft} weight={highlight ? 'semibold' : 'medium'}>
        {value}
      </T>
    </View>
  );
  return (
    <Phone>
      <T size={12} weight="semibold" style={{ textAlign: 'center', marginTop: 4, height: 20 }}>
        {title}
      </T>
      <Group style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10 }}>
          <Ionicons name="globe" size={13} color="#34C759" />
          <T size={10}>Get contents of</T>
          <View style={{ flex: 1, backgroundColor: '#E6F0FF', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 }}>
            <T size={9} color={C.blue}>
              {filled ? 'https://…supabase.co/…' : 'URL'}
            </T>
          </View>
          <Ionicons name={expanded ? 'chevron-up-circle-outline' : 'chevron-down-circle-outline'} size={15} color={C.blue} />
        </View>
        {expanded && (
          <>
            {row('Method', phase >= 2 ? 'POST' : 'GET', phase === 2)}
            {row('Headers', '›', false)}
            {row('Request Body', phase >= 3 ? body : 'None', phase === 3)}
          </>
        )}
      </Group>
      <T size={9} color={C.soft} style={{ textAlign: 'center', marginTop: 12 }}>
        {['Tap URL, then paste the link', 'Tap the arrow to show more', 'Method → POST', `Request Body → ${body}`][phase]}
      </T>
      <Taps key={phase} points={[[{ x: 150, y: 52 }, { x: W - 28, y: 52 }, { x: W - 40, y: 87 }, { x: W - 40, y: 147 }][phase]]} />
    </Phone>
  );
}

/** Step 7: add a Text field per value; for amount/merchant/card, pick Shortcut Input and the right detail. */
function FieldsScreen() {
  const phase = usePhase(7, 1600);
  const fields: [string, React.ReactNode][] = [];
  if (phase >= 2) fields.push(['token', <T key="t" size={8.5} color={C.soft}>{phase === 2 ? 'paste your key' : 'Xk29…'}</T>]);
  if (phase >= 3) fields.push(['amount', phase === 3 ? <View key="a" style={{ width: 40, height: 12, borderRadius: 3, borderWidth: 1, borderColor: C.blue }} /> : phase <= 5 ? <Chip key="a" label="Shortcut Input" /> : <Chip key="a" label="Amount" />]);
  if (phase >= 6) {
    fields.push(['merchant', <Chip key="m" label="Merchant" />]);
    fields.push(['card', <Chip key="c" label="Name" />]);
  }
  const top = 10;
  const addY = top + 30 + fields.length * 30 + 15;
  const tap: { x: number; y: number }[] = [
    [{ x: 70, y: addY }],
    [{ x: 120, y: addY + 26 }],
    [{ x: 170, y: top + 30 + 15 }],
    [{ x: W / 2, y: H - 30 - 104 }],
    [{ x: 160, y: top + 30 + 45 }],
    [{ x: 70, y: H - 30 - 50 }],
    [{ x: W - 26, y: -16 }],
  ][phase];
  return (
    <Phone>
      <Group style={{ marginTop: top }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 30, paddingHorizontal: 10 }}>
          <T size={10}>Request Body</T>
          <T size={10} color={C.blue} weight="semibold">
            JSON
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
      {phase === 1 && (
        <View style={{ position: 'absolute', left: 50, top: 30 + addY + 8, width: 110, backgroundColor: C.card, borderRadius: 10, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 6 }}>
          {['Text', 'Number', 'Array', 'Dictionary', 'Boolean'].map((o, i) => (
            <T key={o} size={10} weight={i === 0 ? 'semibold' : 'medium'} color={i === 0 ? C.blue : C.text} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
              {o}
            </T>
          ))}
        </View>
      )}
      {phase === 3 && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, backgroundColor: '#D1D3D9' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, backgroundColor: '#E9EAEE' }}>
            <Chip label="Shortcut Input" />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 6, justifyContent: 'center' }}>
            {'qwertyuiopasdfghjkl'.split('').map((k) => (
              <View key={k} style={{ width: 18, height: 22, borderRadius: 4, backgroundColor: '#fff' }} />
            ))}
          </View>
        </View>
      )}
      {phase === 5 && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: C.card, paddingTop: 10, paddingBottom: 14 }}>
          <T size={11} weight="bold" style={{ paddingHorizontal: 14, marginBottom: 6 }}>
            Shortcut Input
          </T>
          {['Card or Pass', 'Merchant', 'Amount', 'Name'].map((o) => (
            <T key={o} size={10} color={o === 'Amount' ? C.blue : C.text} weight={o === 'Amount' ? 'semibold' : 'medium'} style={{ paddingHorizontal: 14, paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line }}>
              {o}
            </T>
          ))}
        </View>
      )}
      <T size={9} color={C.soft} style={{ position: 'absolute', left: 0, right: 0, bottom: phase === 3 ? 128 : phase === 5 ? 140 : 18, textAlign: 'center' }}>
        {['Add new field', 'Choose Text', 'token: paste your key', 'Tap the value, then Shortcut Input', 'Tap Shortcut Input again', 'Pick Amount', 'Same for merchant and card'][phase]}
      </T>
      {phase < 6 && <Taps key={phase} points={[tap[0]]} />}
    </Phone>
  );
}

function SaveScreen() {
  return (
    <Phone>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginBottom: 12 }}>
        <Ionicons name="chevron-back" size={15} color={C.blue} />
        <T size={12} weight="semibold">
          Wallet
        </T>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      </View>
      <Group>
        <ListRow icon="wallet" color="#1C1C1E" title="When I tap any card" sub="Run Immediately" right={<View />} />
        <ListRow icon="globe" color="#34C759" title="Get Contents of URL" sub="POST · log_payment" last right={<View />} />
      </Group>
      <Taps points={[{ x: W - 26, y: 12 }]} />
    </Phone>
  );
}

const JsonLinkScreen = () => <LinkScreen />;
const WalletActionSearchScreen = () => <ActionSearchScreen />;

export const SHORTCUT_MOCKS = [HomeScreen, AutomationTabScreen, TriggerScreen, CardsScreen, WalletActionSearchScreen, JsonLinkScreen, FieldsScreen, SaveScreen];

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type NativeScrollEvent, type NativeSyntheticEvent, Platform, ScrollView, type ScrollViewInstance, useWindowDimensions, View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { PixelPet } from '@/components/PixelPet';
import { Screen } from '@/components/Screen';
import { Button, haptic, Row, Txt } from '@/components/ui';
import { isAndroidDevice, isAppleDevice } from '@/cloud/pro';
import type { PetKind } from '@/store/types';
import { GRADIENT, RADIUS, useTheme } from '@/theme';

/*
 * The first thing a new account sees: a swipeable tour of what Plan can do, each slide with its own small
 * animation, marking what's free and what needs Pro. Automation shows what works on this device.
 */

const native = Platform.OS !== 'web';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tier = 'free' | 'pro' | 'mixed';
type Chip = { icon: IconName; label: string };
type Slide = { key: string; icon: IconName; title: string; text: string; tier: Tier; tierLabel?: string; where?: string; chips: Chip[]; scene?: 'brand' | 'pets' | 'tap' | 'notify' | 'wallet' | 'scan' };

function slides(): Slide[] {
  const apple = isAppleDevice();
  const android = isAndroidDevice();
  const automation: Slide[] = android
    ? [
        {
          key: 'wallet',
          icon: 'phone-portrait-outline',
          title: 'Tap to pay, it’s logged',
          text: 'Pay with Google or Samsung Wallet. It’s in your budget before you put your phone away.',
          tier: 'pro',
          tierLabel: 'Pro · Android',
          chips: [],
          where: 'Set up in Settings › Automation › Google Pay auto-log',
          scene: 'wallet',
        },
        {
          key: 'notify',
          icon: 'notifications-outline',
          title: 'Bus and train fares, logged',
          text: 'Tap through the gantry as usual. When SimplyGo sends your Trip Fare Alert, Plan logs the exact fare.',
          tier: 'pro',
          tierLabel: 'Pro · Android',
          chips: [],
          where: 'Set up in Settings › Automation › SimplyGo fare auto-log',
          scene: 'notify',
        },
      ]
    : [
        {
          key: 'tap',
          icon: 'phone-portrait-outline',
          title: 'Tap to pay, it’s logged',
          text: apple ? 'Pay with Apple Pay. It’s in your budget before you put your phone away.' : 'Every Apple Pay or Google Wallet tap goes straight into your budget.',
          tier: 'pro',
          tierLabel: 'Pro · iPhone iOS 17+',
          chips: [],
          where: 'Set up in Settings › Automation › Apple Pay auto-log',
          scene: 'tap',
        },
        {
          key: 'notify',
          icon: 'notifications-outline',
          title: 'Bus and train fares, logged',
          text: 'Tap through the gantry as usual. When SimplyGo sends your Trip Fare Alert, Plan logs the exact fare.',
          tier: 'pro',
          tierLabel: 'Pro · iPhone iOS 27+',
          chips: [],
          where: 'Set up in Settings › Automation › SimplyGo fare auto-log',
          scene: 'notify',
        },
      ];
  return [
    {
      key: 'welcome',
      icon: 'sparkles',
      title: 'Welcome to Plan',
      text: 'Give every dollar a job and feel in control.',
      tier: 'free',
      tierLabel: 'Let’s take a quick look',
      chips: [
        { icon: 'wallet-outline', label: 'Budget' },
        { icon: 'trending-up-outline', label: 'Grow' },
        { icon: 'happy-outline', label: 'Relax' },
      ],
      scene: 'brand',
    },
    {
      key: 'plan',
      icon: 'grid-outline',
      title: 'Give every dollar a job',
      text: 'Plan your money before you spend it. Overspent? Cover it in one tap.',
      tier: 'free',
      chips: [
        { icon: 'home-outline', label: 'Rent' },
        { icon: 'cart-outline', label: 'Groceries' },
        { icon: 'bus-outline', label: 'Transport' },
        { icon: 'airplane-outline', label: 'Holiday' },
      ],
    },
    {
      key: 'spend',
      icon: 'receipt-outline',
      title: 'Every account, one place',
      text: 'Cards, banks and cash together. Split, schedule and reconcile in seconds.',
      tier: 'free',
      chips: [
        { icon: 'card-outline', label: 'Cards' },
        { icon: 'repeat-outline', label: 'Scheduled' },
        { icon: 'git-branch-outline', label: 'Splits' },
        { icon: 'checkmark-done-outline', label: 'Reconcile' },
      ],
    },
    {
      key: 'goals',
      icon: 'flag-outline',
      title: 'Targets and insights',
      text: 'Set targets for bills and savings. See trends and how you’re really doing.',
      tier: 'free',
      chips: [
        { icon: 'flag-outline', label: 'Targets' },
        { icon: 'bar-chart-outline', label: 'Reports' },
        { icon: 'pulse-outline', label: 'Health' },
        { icon: 'notifications-outline', label: 'Reminders' },
      ],
    },
    {
      key: 'pets',
      icon: 'paw',
      title: 'Meet your companion',
      text: 'A little pet that cheers you on. Happiest when your budget’s on track.',
      tier: 'mixed',
      tierLabel: '3 free · every companion with Pro',
      chips: [],
      where: 'Pick one in Settings › Companion',
          scene: 'pets',
    },
    ...automation,
    {
      key: 'scan',
      icon: 'scan-outline',
      title: 'Snap it, AI logs it',
      text: android ? 'Snap a receipt or screenshot a payment. AI fills in the rest.' : 'Snap a receipt, or triple-tap your iPhone on a payment screen. AI fills in the rest.',
      tier: 'pro',
      tierLabel: 'Pro · any device',
      chips: [],
      where: android ? 'Tap Scan receipt when adding a transaction' : 'Set up one tap in Settings › Automation › AI receipt scan',
          scene: 'scan',
    },
    {
      key: 'share',
      icon: 'people-outline',
      where: 'Set up in Settings › Account & sharing',
      title: 'Budget together',
      text: 'Share with a partner or housemates. Keep separate budgets for anything.',
      tier: 'pro',
      chips: [
        { icon: 'person-outline', label: 'You' },
        { icon: 'heart-outline', label: 'Partner' },
        { icon: 'albums-outline', label: 'Unlimited budgets' },
      ],
    },
    {
      key: 'private',
      icon: 'lock-closed-outline',
      title: 'Private by design',
      text: 'Encrypted on your device, synced everywhere you use Plan.',
      tier: 'free',
      chips: [
        { icon: 'shield-checkmark-outline', label: 'Encrypted' },
        { icon: 'sync-outline', label: 'Sync' },
        { icon: 'download-outline', label: 'Export anytime' },
      ],
    },
  ];
}

/** 0 → 1 each time `active` turns on, and a gentle endless 0 → 1 → 0 float while it is. */
function useEntrance(active: boolean) {
  const [enter] = useState(() => new Animated.Value(0));
  const [float] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      enter.setValue(0);
      return;
    }
    Animated.timing(enter, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(float, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, enter, float]);
  return { enter, float };
}

/** Repeats a 0 → 1 timeline while active (for little stories like "tap, then it's logged"). */
function useStory(active: boolean, ms = 3200) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    t.setValue(0);
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(t, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: native }), Animated.delay(500)]));
    loop.start();
    return () => loop.stop();
  }, [active, t, ms]);
  return t;
}

function TierBadge({ tier, label }: { tier: Tier; label?: string }) {
  const { colors } = useTheme();
  if (tier === 'pro') {
    return (
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Ionicons name="sparkles" size={12} color={colors.onGradient} />
        <Txt variant="label" style={{ color: colors.onGradient }}>
          {label ?? 'Pro'}
        </Txt>
      </LinearGradient>
    );
  }
  const mixed = tier === 'mixed';
  return (
    <Row style={{ gap: 5, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: mixed ? colors.accentSoft : colors.positiveSoft }}>
      <Ionicons name={mixed ? 'sparkles-outline' : 'checkmark-circle'} size={12} color={mixed ? colors.accent : colors.positive} />
      <Txt variant="label" style={{ color: mixed ? colors.accent : colors.positive }}>
        {label ?? 'Free'}
      </Txt>
    </Row>
  );
}

/** The big floating icon in a gradient bubble, with chips popping in around it. */
function IconScene({ slide, active }: { slide: Slide; active: boolean }) {
  const { colors } = useTheme();
  const { enter, float } = useEntrance(active);
  const y = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  return (
    <View style={{ alignItems: 'center', gap: 22 }}>
      <Animated.View style={{ opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { translateY: y }] }}>
        {slide.scene === 'brand' ? (
          <BrandMark size={112} />
        ) : (
          <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 112, height: 112, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={slide.icon} size={52} color={colors.onGradient} />
          </LinearGradient>
        )}
      </Animated.View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 320 }}>
        {slide.chips.map((c, i) => {
          const start = Math.min(0.9, 0.25 + i * 0.15);
          const p = enter.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
          return (
            <Animated.View key={c.label} style={{ opacity: p, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
              <Row style={{ gap: 6, backgroundColor: colors.surface, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name={c.icon} size={14} color={colors.accent} />
                <Txt variant="caption" style={{ color: colors.text }}>
                  {c.label}
                </Txt>
              </Row>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

function PetsScene({ active }: { active: boolean }) {
  const { enter, float } = useEntrance(active);
  const [frame, setFrame] = useState<0 | 1>(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setFrame((f) => (f ? 0 : 1)), 520);
    return () => clearInterval(t);
  }, [active]);
  const pets: { kind: PetKind; pro: boolean }[] = [
    { kind: 'cat', pro: false },
    { kind: 'dog', pro: false },
    { kind: 'bunny', pro: false },
    { kind: 'fox', pro: true },
    { kind: 'panda', pro: true },
    { kind: 'penguin', pro: true },
  ];
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, maxWidth: 300 }}>
      {pets.map((p, i) => {
        const start = Math.min(0.85, i * 0.12);
        const s = enter.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        const bob = float.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [0, -8] : [-8, 0] });
        return (
          <Animated.View key={p.kind} style={{ alignItems: 'center', opacity: s, transform: [{ scale: s }, { translateY: bob }] }}>
            <View style={{ width: 78, height: 78, borderRadius: 24, backgroundColor: p.pro ? colors.accentSoft : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <PixelPet kind={p.kind} mood={i % 3 ? 'happy' : 'thriving'} size={56} frame={frame} />
            </View>
            {p.pro && (
              <View style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.accent, borderRadius: RADIUS.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Txt variant="caption" style={{ color: colors.onGradient, fontSize: 10 }}>
                  PRO
                </Txt>
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

/** A phone with a banner or tap at the top and the logged transaction sliding into the list. */
function AutoScene({ kind, active }: { kind: 'tap' | 'notify' | 'wallet'; active: boolean }) {
  const { colors } = useTheme();
  const t = useStory(active);
  const { enter } = useEntrance(active);
  const banner = t.interpolate({ inputRange: [0, 0.12, 0.3, 0.75, 0.9, 1], outputRange: [-80, -80, 0, 0, -80, -80] });
  const row = t.interpolate({ inputRange: [0, 0.4, 0.55, 0.95, 1], outputRange: [0, 0, 1, 1, 0] });
  const pulse = t.interpolate({ inputRange: [0, 0.1, 0.3, 1], outputRange: [0.6, 1.25, 0.6, 0.6] });
  const info =
    kind === 'notify'
      ? { app: 'Trip Fare Alert', icon: 'bus' as IconName, color: '#4F6BD8', line: 'Fare $1.28 - Bus 12 Blk 108 - Clementi Int', payee: 'SimplyGo', amount: '−$1.28' }
      : kind === 'wallet'
        ? { app: 'Google Wallet', icon: 'wallet' as IconName, color: '#1A73E8', line: '$5.80 with Visa •••• 1234', payee: 'Kopi Corner', amount: '−$5.80' }
        : { app: 'Apple Pay', icon: 'logo-apple' as IconName, color: '#111111', line: 'Kopi Corner · $5.80', payee: 'Kopi Corner', amount: '−$5.80' };
  return (
    <Animated.View style={{ opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
      <View style={{ width: 210, height: 250, borderRadius: 34, padding: 7, backgroundColor: '#1C1C1E' }}>
        <View style={{ flex: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.bg, paddingTop: 70, paddingHorizontal: 12, gap: 8 }}>
          <Animated.View style={{ position: 'absolute', top: 10, left: 8, right: 8, transform: [{ translateY: banner }] }}>
            <Row style={{ gap: 8, backgroundColor: colors.surface, borderRadius: 14, padding: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 }}>
              <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: info.color, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={info.icon} size={14} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="caption" style={{ color: colors.text, fontSize: 11 }} numberOfLines={1}>
                  {info.app}
                </Txt>
                <Txt variant="caption" tone="muted" style={{ fontSize: 10 }} numberOfLines={1}>
                  {info.line}
                </Txt>
              </View>
            </Row>
          </Animated.View>
          {kind === 'tap' && (
            <Animated.View style={{ position: 'absolute', top: 18, alignSelf: 'center', left: 85, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.accent, opacity: t.interpolate({ inputRange: [0, 0.3, 0.35], outputRange: [1, 1, 0] }), transform: [{ scale: pulse }] }} />
          )}
          <Txt variant="caption" tone="muted" style={{ fontSize: 10 }}>
            SPENDING
          </Txt>
          <Animated.View style={{ opacity: row, transform: [{ translateX: row.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
            <Row style={{ gap: 8, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 8 }}>
              <Ionicons name="flash" size={14} color={colors.accent} />
              <Txt variant="caption" style={{ flex: 1, color: colors.text, fontSize: 11 }} numberOfLines={1}>
                {info.payee}
              </Txt>
              <Txt variant="caption" style={{ color: colors.text, fontSize: 11 }}>
                {info.amount}
              </Txt>
            </Row>
          </Animated.View>
          {['Groceries', 'Dinner'].map((n, i) => (
            <Row key={n} style={{ gap: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 8 }}>
              <Ionicons name={i ? 'restaurant-outline' : 'cart-outline'} size={14} color={colors.muted} />
              <Txt variant="caption" tone="soft" style={{ flex: 1, fontSize: 11 }}>
                {n}
              </Txt>
              <Txt variant="caption" tone="soft" style={{ fontSize: 11 }}>
                {i ? '−$24.00' : '−$62.10'}
              </Txt>
            </Row>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function ScanScene({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const t = useStory(active, 2400);
  const { enter } = useEntrance(active);
  const line = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 150, 150] });
  const done = t.interpolate({ inputRange: [0, 0.7, 0.8, 1], outputRange: [0, 0, 1, 1] });
  return (
    <Animated.View style={{ alignItems: 'center', gap: 14, opacity: enter }}>
      <View style={{ width: 150, height: 170, borderRadius: 14, backgroundColor: colors.surface, padding: 14, gap: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <Txt variant="strong" center>
          FairPrice
        </Txt>
        {[0.8, 0.6, 0.7, 0.5].map((w, i) => (
          <View key={i} style={{ height: 6, width: `${w * 100}%`, borderRadius: 3, backgroundColor: colors.sunken }} />
        ))}
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <Txt variant="caption" tone="soft">
            TOTAL
          </Txt>
          <Txt variant="strong">$48.20</Txt>
        </Row>
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: colors.accent, opacity: 0.8, transform: [{ translateY: line }] }} />
      </View>
      <Animated.View style={{ opacity: done, transform: [{ scale: done.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
        <Row style={{ gap: 6, backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Ionicons name="sparkles" size={14} color={colors.accent} />
          <Txt variant="caption" style={{ color: colors.text }}>
            FairPrice · $48.20 · Groceries
          </Txt>
        </Row>
      </Animated.View>
    </Animated.View>
  );
}

function SlideView({ slide, active, width, height }: { slide: Slide; active: boolean; width: number; height: number }) {
  // Short screens (e.g. iPhone SE): shrink the animation so the words still fit above the buttons.
  // `height` is the screen's; the header, dots and buttons take about 230 of it, the words about 230.
  const scale = Math.max(0.5, Math.min(1, (height - 460) / 260));
  const [text] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return text.setValue(0);
    Animated.timing(text, { toValue: 1, duration: 450, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [active, text]);
  const scene =
    slide.scene === 'pets' ? (
      <PetsScene active={active} />
    ) : slide.scene === 'tap' || slide.scene === 'notify' || slide.scene === 'wallet' ? (
      <AutoScene kind={slide.scene} active={active} />
    ) : slide.scene === 'scan' ? (
      <ScanScene active={active} />
    ) : (
      <IconScene slide={slide} active={active} />
    );
  return (
    <View style={{ width, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', gap: scale < 1 ? 12 : 26 }}>
      <View style={{ height: 260 * scale, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ transform: [{ scale }] }}>{scene}</View>
      </View>
      <Animated.View style={{ alignItems: 'center', gap: 10, opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <TierBadge tier={slide.tier} label={slide.tierLabel} />
        <Txt variant="title" center>
          {slide.title}
        </Txt>
        <Txt tone="soft" center style={{ maxWidth: 360 }}>
          {slide.text}
        </Txt>
        {!!slide.where && <Where path={slide.where} />}
      </Animated.View>
    </View>
  );
}

/** Where to find the feature later, e.g. "Pick one in Settings › Companion". */
function Where({ path }: { path: string }) {
  const { colors } = useTheme();
  return (
    <Row style={{ gap: 6, backgroundColor: colors.sunken, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 360 }}>
      <Ionicons name={path.startsWith('Tap') ? 'add-circle-outline' : 'settings-outline'} size={13} color={colors.textSoft} />
      <Txt variant="caption" tone="soft" style={{ flexShrink: 1 }}>
        {path}
      </Txt>
    </Row>
  );
}

function Dot({ on }: { on: boolean }) {
  const { colors } = useTheme();
  const [w] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(w, { toValue: on ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [on, w]);
  return <Animated.View style={{ height: 8, borderRadius: 4, width: w.interpolate({ inputRange: [0, 1], outputRange: [8, 24] }), backgroundColor: on ? colors.accent : colors.border }} />;
}

/** Swipeable feature tour; `onDone` when they finish or skip. */
export function FeatureTour({ onDone }: { onDone: () => void }) {
  const [list] = useState(slides);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const { height } = useWindowDimensions();
  const scroller = useRef<ScrollViewInstance>(null);
  const last = index === list.length - 1;

  const go = (i: number) => {
    haptic();
    setIndex(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i < list.length) setIndex(i);
  };

  return (
    <Screen
      scroll={false}
      maxWidth={560}
      right={last ? undefined : <Button title="Skip" variant="ghost" small onPress={onDone} />}
      footer={
        <View style={{ gap: 14 }}>
          <Row style={{ gap: 6, justifyContent: 'center' }}>
            {list.map((s, i) => (
              <Dot key={s.key} on={i === index} />
            ))}
          </Row>
          <Row style={{ gap: 10 }}>
            {index > 0 && <Button title="Back" variant="soft" icon="chevron-back" style={{ flex: 1 }} onPress={() => go(index - 1)} />}
            <Button title={last ? 'Get started' : 'Next'} icon={last ? 'sparkles' : undefined} style={{ flex: 1.6 }} onPress={() => (last ? onDone() : go(index + 1))} />
          </Row>
        </View>
      }
    >
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            contentContainerStyle={{ alignItems: 'center' }}
            accessibilityLabel="What Plan can do"
          >
            {list.map((s, i) => (
              <SlideView key={s.key} slide={s} active={i === index} width={width} height={height} />
            ))}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

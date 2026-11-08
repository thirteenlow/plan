import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, useWindowDimensions, View } from 'react-native';
import { BADGES, HEART, PixelArt, PixelPet } from '@/components/PixelPet';
import { haptic, Txt } from '@/components/ui';
import { MOODS, petMood, type Mood, type PetMood } from '@/engine/pet';
import { useUi } from '@/hooks/useBudget';
import { useBudgetData } from '@/store/store';
import type { PetKind } from '@/store/types';
import { RADIUS, useTheme } from '@/theme';
import { currentMonth, today } from '@/utils/date';
import { formatMoney } from '@/utils/money';

const native = Platform.OS !== 'web';

/** Walking speed (px/s) and how often it hops, by mood. Stressed pets stay put and tremble. */
const MOTION: Record<Mood, { speed: number; hop: number }> = {
  thriving: { speed: 62, hop: 0.6 },
  happy: { speed: 46, hop: 0.3 },
  okay: { speed: 30, hop: 0.08 },
  worried: { speed: 20, hop: 0 },
  stressed: { speed: 0, hop: 0 },
};

/** The current month's mood for the active budget (recomputed when the budget changes). */
export function usePetMood(): PetMood | null {
  const data = useBudgetData();
  return useMemo(() => (data ? petMood(data, currentMonth(), today(), (m) => formatMoney(m, { c: data.settings.currency })) : null), [data]);
}

/** The pixel animal with its mood effects: a walk cycle and bob, a gentle idle bounce, a badge, trembling when stressed. */
export function PetSprite({
  kind,
  mood,
  size = 48,
  walking = false,
  flip = false,
  heart = false,
}: {
  kind: PetKind;
  mood: Mood;
  size?: number;
  walking?: boolean;
  flip?: boolean;
  /** Being tickled: a heart replaces the mood badge */
  heart?: boolean;
}) {
  const [bob] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));

  useEffect(() => {
    bob.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: walking ? 170 : 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(bob, { toValue: 0, duration: walking ? 170 : 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, walking]);

  useEffect(() => {
    if (mood !== 'stressed') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: native }),
        Animated.timing(shake, { toValue: -1, duration: 120, useNativeDriver: native }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: native }),
        Animated.delay(900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shake, mood]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: native }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  // Two-frame leg cycle while walking.
  const [frame, setFrame] = useState<0 | 1>(0);
  useEffect(() => {
    if (!walking) return;
    const t = setInterval(() => setFrame((f) => (f ? 0 : 1)), 180);
    return () => clearInterval(t);
  }, [walking]);

  const badge = heart ? HEART : BADGES[mood];
  const badgeSize = size * (mood === 'stressed' && !heart ? 0.5 : 0.3);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      {!!badge && (
        <Animated.View
          style={{
            position: 'absolute',
            top: mood === 'stressed' && !heart ? -size * 0.42 : -size * 0.12,
            right: mood === 'stressed' && !heart ? undefined : -size * 0.12,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
            transform: [{ translateY: glow.interpolate({ inputRange: [0, 1], outputRange: [0, mood === 'worried' ? 3 : -3] }) }],
          }}
        >
          <PixelArt grid={badge.grid} palette={badge.palette} size={badgeSize} />
        </Animated.View>
      )}
      <Animated.View
        style={{
          transform: [
            { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-1.5, 1.5] }) },
            { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, walking ? -size * 0.08 : -size / 16] }) },
            { scaleX: flip ? -1 : 1 },
          ],
        }}
      >
        {/* Both leg positions are drawn once; walking only swaps which shows (redrawing the pixels every step was slow). */}
        <View style={{ opacity: walking && frame ? 0 : 1 }}>
          <PixelPet kind={kind} mood={mood} size={size} frame={0} />
        </View>
        {walking && (
          <View style={{ position: 'absolute', left: 0, top: 0, opacity: frame ? 1 : 0 }}>
            <PixelPet kind={kind} mood={mood} size={size} frame={1} />
          </View>
        )}
      </Animated.View>
      {/* Ground shadow */}
      <View style={{ position: 'absolute', bottom: -3, width: size * 0.6, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.12)' }} />
    </View>
  );
}

const SIZE = 48;
const TICKLE_LINES = ['Hehe! That tickles!', 'Stop it! Hehehe', 'Again! Again!', 'Hehe, okay okay!'];

/** Tickling: tap it 3 times quickly, or rub it back and forth while holding it. Returns a timed flag and a trigger. */
export function useTickle(onTickle?: () => void) {
  const [tickled, setTickled] = useState(false);
  const taps = useRef<number[]>([]);
  useEffect(() => {
    if (!tickled) return;
    const t = setTimeout(() => setTickled(false), 2600);
    return () => clearTimeout(t);
  }, [tickled]);
  const trigger = () => {
    haptic('success');
    setTickled(true);
    onTickle?.();
  };
  /** Call on each tap; returns true when this tap completed a tickle. */
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1200), now];
    if (taps.current.length < 3) return false;
    taps.current = [];
    trigger();
    return true;
  };
  return { tickled, tap, trigger };
}

type GestureDeps = {
  x: Animated.Value;
  hopY: Animated.Value;
  pos: { current: number };
  widthRef: { current: number };
  /** How far above the ground it can be lifted and stay on screen */
  maxLift: { current: number };
  live: { current: { tap: () => boolean; trigger: () => void; reason: string } };
  setHeld: (v: boolean) => void;
  setBubble: (v: string | null) => void;
};

/**
 * Tap (status), triple tap or rub (tickle), drag (move; drops back down) and hold still (open settings).
 * `drop` lets the pet fall even if the release never arrives (e.g. the mouse let go outside the window).
 */
function petGesture({ x, hopY, pos, widthRef, maxLift, live, setHeld, setBubble }: GestureDeps) {
  let startX = 0;
  let dragging = false;
  let dropped = false;
  let longPress: ReturnType<typeof setTimeout> | undefined;
  let opened = false;
  let lastDir = 0;
  let flips = 0;
  const clampX = (v: number) => Math.min(Math.max(0, widthRef.current - SIZE), Math.max(0, Number.isFinite(v) ? v : pos.current));
  const fall = (height: number) =>
    Animated.timing(hopY, { toValue: 0, duration: 260 + Math.sqrt(Math.max(0, height)) * 22, easing: Easing.bounce, useNativeDriver: native }).start(() => setHeld(false));
  const drop = () => {
    clearTimeout(longPress);
    if (!dragging) return;
    dragging = false;
    dropped = true;
    x.stopAnimation((v) => {
      pos.current = clampX(v);
      x.setValue(pos.current);
    });
    hopY.stopAnimation((v) => fall(-v));
  };
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      dragging = false;
      dropped = false;
      opened = false;
      flips = 0;
      lastDir = 0;
      x.stopAnimation((v) => (startX = v));
      hopY.stopAnimation();
      longPress = setTimeout(() => {
        if (dragging) return;
        opened = true;
        haptic();
        router.push('/pet');
      }, 650);
    },
    onPanResponderMove: (_, g) => {
      if (dropped) return;
      if (!dragging && Math.hypot(g.dx, g.dy) > 6) {
        dragging = true;
        clearTimeout(longPress);
        haptic();
        setHeld(true);
        setBubble(null);
      }
      if (!dragging) return;
      x.setValue(clampX(startX + g.dx));
      // Never above the top of the screen.
      hopY.setValue(Math.min(0, Math.max(-maxLift.current, g.dy)));
      // Rubbing it side to side tickles.
      const dir = Math.abs(g.vx) > 0.25 ? Math.sign(g.vx) : 0;
      if (dir && lastDir && dir !== lastDir && ++flips >= 5) {
        flips = -100; // once per hold
        live.current.trigger();
      }
      if (dir) lastDir = dir;
    },
    onPanResponderRelease: () => {
      clearTimeout(longPress);
      if (opened || dropped) return;
      if (!dragging) {
        haptic();
        if (!live.current.tap()) setBubble(live.current.reason);
        return;
      }
      drop();
    },
    onPanResponderTerminate: drop,
  });
  return { pan, drop };
}

/**
 * Lets the chosen companion wander along the bottom of the tab screens. Tap it to hear how the budget is going,
 * drag it anywhere (it falls back down when let go), tickle it, or hold it still to open its screen. It wanders
 * clear of the floating Transaction button (`right`); if dropped there it's drawn on top and walks back out.
 */
export function RoamingPet({ bottom, right }: { bottom: number; right: number }) {
  const data = useBudgetData();
  const pet = data?.settings.pet;
  const mood = usePetMood();
  const assigning = useUi((s) => s.assigning);
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(16));
  const [hopY] = useState(() => new Animated.Value(0));
  const pos = useRef(16);
  const widthRef = useRef(0);
  const { height: screenHeight } = useWindowDimensions();
  const maxLift = useRef(0);
  useEffect(() => {
    // Leave room for the status bar so it can't be lifted off the top.
    maxLift.current = Math.max(0, screenHeight - bottom - SIZE - 56);
  }, [screenHeight, bottom]);
  const [walking, setWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [held, setHeld] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [bubbleLeft, setBubbleLeft] = useState(-6);
  const [giggle, setGiggle] = useState(false);
  const hop = (times: number) =>
    Animated.sequence(
      Array.from({ length: times }, () => [
        Animated.timing(hopY, { toValue: -14, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(hopY, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: native }),
      ]).flat(),
    ).start();
  const { tickled, tap, trigger } = useTickle(() => {
    setGiggle(true);
    setBubble(TICKLE_LINES[Math.floor(Math.random() * TICKLE_LINES.length)]);
    hop(3);
  });
  const m = mood?.mood ?? 'happy';

  // It stops to talk, be held or giggle.
  const busy = held || tickled || !!bubble;

  // Wander: walk to a random spot, rest a few seconds, sometimes hop, repeat. Paused while held or tickled.
  useEffect(() => {
    if (!width || !pet || pet.hidden || busy) return;
    const { speed, hop: hopChance } = MOTION[m];
    const max = Math.max(16, width - right - SIZE);
    let timer: ReturnType<typeof setTimeout>;
    let anim: Animated.CompositeAnimation | null = null;
    let alive = true;
    const rest = () => {
      if (!alive) return;
      setWalking(false);
      if (Math.random() < hopChance) {
        Animated.sequence([
          Animated.timing(hopY, { toValue: -16, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(hopY, { toValue: 0, duration: 220, easing: Easing.bounce, useNativeDriver: native }),
        ]).start();
      }
      timer = setTimeout(walk, 1800 + Math.random() * 3500);
    };
    const walk = () => {
      if (!alive) return;
      // Even a stressed pet shuffles out from over the Transaction button.
      const pace = speed || (pos.current > max ? 24 : 0);
      if (!pace) return rest();
      const to = 16 + Math.random() * (max - 16);
      const dist = Math.abs(to - pos.current);
      if (dist < 30 && pos.current <= max) return rest();
      setFacingLeft(to < pos.current);
      setWalking(true);
      anim = Animated.timing(x, { toValue: to, duration: (dist / pace) * 1000, easing: Easing.linear, useNativeDriver: native });
      anim.start(({ finished }) => {
        if (finished) pos.current = to;
        rest();
      });
    };
    // Keep it on screen after a resize.
    if (pos.current > width - SIZE) {
      pos.current = max;
      x.setValue(max);
    }
    // Dropped over the button: walk out straight away.
    timer = setTimeout(walk, pos.current > max ? 300 : 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
      anim?.stop();
      setWalking(false);
    };
  }, [width, right, m, pet, x, hopY, busy]);

  useEffect(() => {
    if (!bubble) return;
    // Keep the bubble on screen when the pet is near the right edge.
    x.stopAnimation((v) => setBubbleLeft(Math.min(-6, width - 218 - v)));
    const t = setTimeout(() => {
      setBubble(null);
      setGiggle(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [bubble, x, width]);

  // Gesture handlers read live values through refs.
  const live = useRef({ tap, trigger, reason: '' });
  useEffect(() => {
    live.current = { tap, trigger, reason: mood?.reasons[0]?.text ?? MOODS[m].line };
  });
  // The refs are only read inside the gesture callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [{ pan, drop }] = useState(() => petGesture({
      x,
      hopY,
      pos,
      widthRef,
      maxLift,
      live,
      setHeld,
      setBubble: (v) => {
        setGiggle(false);
        setBubble(v);
      },
    }),
  );

  // Safety nets while it's held: drop it if the release is lost (mouse let go outside the window, tab switched),
  // and after a long hold in case a touch release never arrives.
  useEffect(() => {
    if (!held) return;
    const watchdog = setTimeout(drop, 15000);
    if (Platform.OS !== 'web' || typeof window === 'undefined') return () => clearTimeout(watchdog);
    const events = ['mouseup', 'pointerup', 'touchend', 'touchcancel', 'blur'] as const;
    events.forEach((e) => window.addEventListener(e, drop));
    document.addEventListener('mouseleave', drop);
    return () => {
      clearTimeout(watchdog);
      events.forEach((e) => window.removeEventListener(e, drop));
      document.removeEventListener('mouseleave', drop);
    };
  }, [held, drop]);

  if (!pet || pet.hidden || !mood) return null;
  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
      style={{ position: 'absolute', left: 0, right: 0, bottom, height: SIZE + 140, opacity: assigning ? 0 : 1 }}
    >
      <Animated.View pointerEvents="box-none" style={{ position: 'absolute', bottom: 0, left: 0, transform: [{ translateX: x }, { translateY: hopY }] }}>
        {!!bubble && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: SIZE + 12,
              left: bubbleLeft,
              width: 210,
              padding: 10,
              borderRadius: RADIUS.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
              gap: 2,
            }}
          >
            <Txt variant="label">
              {pet.name} · {giggle ? 'Giggling' : MOODS[mood.mood].label}
            </Txt>
            <Txt variant="caption" tone="soft">
              {bubble}
            </Txt>
          </View>
        )}
        <View
          {...pan.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${pet.name}, ${MOODS[mood.mood].label}. Tap to hear how your budget is going, tap three times to tickle, or drag to move.`}
          accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Open companion settings' }]}
          onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? router.push('/pet') : setBubble(live.current.reason))}
          hitSlop={8}
          style={{ cursor: held ? 'grabbing' : 'grab', userSelect: 'none' } as object}
        >
          <PetSprite kind={pet.kind} mood={tickled ? 'thriving' : mood.mood} size={SIZE} walking={walking || held} flip={facingLeft} heart={tickled} />
        </View>
      </Animated.View>
    </View>
  );
}

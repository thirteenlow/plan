import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { BrandMark } from './BrandMark';

/** One breath, in ms: the same as the page's own loader (public/index.html, `breathe`). */
const PERIOD = 1800;

/** Where in the breath we are, from 0 to 1 and back: timed from page load, so every loading stage stays in step. */
function breath(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return (1 - Math.cos((2 * Math.PI * (now % PERIOD)) / PERIOD)) / 2;
}

/**
 * The Plan logo breathing gently, for while the app loads. It picks up exactly where the page's loader (and any
 * earlier loading screen) was, so moving from one loading stage to the next doesn't jump.
 */
export function LoadingLogo({ size = 72 }: { size?: number }) {
  const [b, setB] = useState(breath);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setB(breath());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const scale = 0.92 + 0.12 * b;
  const glow =
    Platform.OS === 'web'
      ? ({ filter: `drop-shadow(0 0 ${18 * b}px rgba(154, 92, 245, ${0.45 * b}))` } as object)
      : { shadowColor: '#9A5CF5', shadowOpacity: 0.45 * b, shadowRadius: 18 * b, shadowOffset: { width: 0, height: 0 } };
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading Plan" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[{ transform: [{ scale }] }, glow]}>
        <BrandMark size={size} />
      </View>
    </View>
  );
}

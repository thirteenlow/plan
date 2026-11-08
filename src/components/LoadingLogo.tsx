import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { BrandMark } from './BrandMark';

const native = Platform.OS !== 'web';

/** The Plan logo breathing gently, for while the app loads. */
export function LoadingLogo({ size = 72 }: { size?: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.04] });
  const glow = t.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] });
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading Plan" style={{ alignItems: 'center', justifyContent: 'center', width: size * 1.8, height: size * 1.8 }}>
      <Animated.View style={{ position: 'absolute', width: size * 1.5, height: size * 1.5, borderRadius: size, backgroundColor: '#9A5CF5', opacity: glow, transform: [{ scale }] }} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <BrandMark size={size} />
      </Animated.View>
    </View>
  );
}

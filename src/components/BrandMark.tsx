import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { GRADIENT } from '@/theme';

/*
 * The Plan logo, drawn as vectors so it's crisp at any size: a P monogram with a coin dot on the brand gradient.
 * Same geometry as scripts/generate-icons.mjs, which makes the app icons, splash and favicon.
 */
export function BrandMark({ size = 44, rounded = true }: { size?: number; rounded?: boolean }) {
  const id = `brand${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Plan">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {GRADIENT.map((c, i) => (
            <Stop key={c} offset={i / (GRADIENT.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width={100} height={100} rx={rounded ? 22.66 : 0} fill={`url(#${id})`} />
      <Rect x={27} y={24.6} width={12.5} height={54} rx={6.25} fill="#FFFFFF" />
      <Circle cx={50} cy={42.6} r={15} fill="none" stroke="#FFFFFF" strokeWidth={12.5} />
      <Circle cx={67.5} cy={73.1} r={5.5} fill="#FFFFFF" fillOpacity={0.88} />
    </Svg>
  );
}

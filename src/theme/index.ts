import { useColorScheme, useWindowDimensions } from 'react-native';
import { useStore } from '@/store/store';

export const GRADIENT = ['#3DB6F5', '#B65CF4', '#FF9A6A'] as const;
export const GRADIENT_SOFT = ['#E6F6FE', '#F4E9FE', '#FFEFE7'] as const;

const light = {
  bg: '#F3F4F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F8FC',
  sunken: '#EEF0F6',
  text: '#1E2640',
  textSoft: '#4A536B',
  muted: '#9AA2B6',
  border: '#E9EBF2',
  accent: '#9A5CF5',
  accentSoft: '#F1EAFE',
  positive: '#14B57A',
  positiveSoft: '#E3F7EF',
  warning: '#E8A019',
  warningSoft: '#FDF3DD',
  danger: '#EF4455',
  dangerSoft: '#FDE7EA',
  credit: '#F57E3B',
  creditSoft: '#FEEDE3',
  zeroSoft: '#EEF0F5',
  overlay: 'rgba(20,24,40,0.35)',
  shadow: '#5B6386',
  onGradient: '#FFFFFF',
};

export type Colors = typeof light;

const dark: Colors = {
  bg: '#0E111C',
  surface: '#181C2B',
  surfaceAlt: '#1E2335',
  sunken: '#13172A',
  text: '#F2F4FA',
  textSoft: '#C3C8D8',
  muted: '#7E879F',
  border: '#272C40',
  accent: '#B486FF',
  accentSoft: '#2A2342',
  positive: '#2FD192',
  positiveSoft: '#123327',
  warning: '#F2B33D',
  warningSoft: '#3A2E14',
  danger: '#FF5D6C',
  dangerSoft: '#3D1A20',
  credit: '#FF9356',
  creditSoft: '#3D2416',
  zeroSoft: '#23283A',
  overlay: 'rgba(0,0,0,0.55)',
  shadow: '#000000',
  onGradient: '#FFFFFF',
};

export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const RADIUS = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export const FLAG_COLORS: Record<string, string> = {
  red: '#EF4455',
  orange: '#F57E3B',
  yellow: '#F2C230',
  green: '#14B57A',
  blue: '#3D8BF5',
  purple: '#9A5CF5',
};

export function useTheme() {
  const pref = useStore((s) => s.theme);
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  const colors = isDark ? dark : light;
  return {
    isDark,
    colors,
    shadow: {
      shadowColor: colors.shadow,
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: isDark ? 0 : 3,
    },
  };
}

export type Theme = ReturnType<typeof useTheme>;

/** Responsive breakpoints. Phones < 768 ≤ tablets < 1100 ≤ wide (tablet landscape / desktop web). */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isWide = width >= 1100;
  const isCompact = width < 360;
  const gutter = isCompact ? 14 : isTablet ? 28 : 18;
  return {
    width,
    height,
    isTablet,
    isWide,
    isCompact,
    isLandscape: width > height,
    gutter,
    /** Max width for single-column reading content */
    contentMax: 760,
    /** Scales typography slightly up on large screens */
    scale: isTablet ? 1.06 : isCompact ? 0.94 : 1,
  };
}

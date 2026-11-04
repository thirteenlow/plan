import React, { useEffect, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, type RefreshControlProps, ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout, useTheme } from '@/theme';
import { useKeyboard } from '@/hooks/useKeyboard';
import { goBack } from '@/utils/nav';
import { IconButton, Row, Txt } from './ui';

/** Space the floating tab bar + "Transaction" button take up on phones. */
export const PHONE_TAB_CLEARANCE = 170;

interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Show a back arrow, or an X for modals */
  back?: 'back' | 'close';
  onBack?: () => void;
  right?: React.ReactNode;
  /** Tab-root style: action buttons on top (left / centre / right), big title underneath */
  largeTitle?: boolean;
  left?: React.ReactNode;
  center?: React.ReactNode;
  /** Custom header content rendered instead of the title */
  header?: React.ReactNode;
  /** Content between the header and the scroll area (not scrolled) */
  belowHeader?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  /** Presented as a modal (iOS sheets don't need the status bar inset) */
  modal?: boolean;
  /** Sticky footer, e.g. a Save button */
  footer?: React.ReactNode;
  maxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Extra bottom padding so content clears the floating tab bar */
  tabBarPadding?: boolean;
}

export function Screen({
  title,
  subtitle,
  back,
  onBack,
  right,
  largeTitle,
  left,
  center,
  header,
  belowHeader,
  children,
  scroll = true,
  modal,
  footer,
  maxWidth,
  contentStyle,
  tabBarPadding,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter, contentMax, isTablet } = useLayout();
  const keyboard = useKeyboard();
  // Every screen eases in (fade plus a slight rise), so moving around the app feels calm rather than jumpy.
  const [appear] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [appear]);
  const width = maxWidth ?? contentMax;
  // Breathing room above the header (web has no status-bar inset). Full-page titles without a back
  // button (sign-in, onboarding) get the most, tab roots a little less, pushed screens the least.
  const top = modal && Platform.OS === 'ios' ? 14 : insets.top + (largeTitle ? 24 : back ? 18 : 36);
  const bottomPad = (tabBarPadding ? (isTablet ? 96 : PHONE_TAB_CLEARANCE) : 24) + (footer ? 0 : insets.bottom);
  const frame = { width: '100%' as const, maxWidth: width + gutter * 2, alignSelf: 'center' as const, paddingHorizontal: gutter };

  const handleBack = () => (onBack ? onBack() : goBack());

  let headerEl: React.ReactNode;
  if (largeTitle) {
    headerEl = (
      <View style={[frame, { paddingTop: top, paddingBottom: title ? 0 : 14 }]}>
        <Row style={{ gap: 10, minHeight: 44 }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>{left}</View>
          {center}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
        </Row>
        {title ? (
          <Txt variant="display" numberOfLines={1} style={{ marginTop: 10, marginBottom: subtitle ? 0 : 8 }}>
            {title}
          </Txt>
        ) : null}
        {subtitle ? (
          <Txt variant="caption" tone="muted" style={{ marginBottom: 8 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
    );
  } else if (title || back || right || header) {
    headerEl = (
      <Row style={[frame, { paddingTop: top, paddingBottom: 10, gap: 12 }]}>
        {back && <IconButton icon={back === 'close' ? 'close' : 'chevron-back'} label={back === 'close' ? 'Close' : 'Back'} onPress={handleBack} size={38} />}
        <View style={{ flex: 1 }}>
          {header ?? (
            <>
              {title ? (
                <Txt variant={back ? 'h2' : 'title'} numberOfLines={1}>
                  {title}
                </Txt>
              ) : null}
              {subtitle ? (
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {subtitle}
                </Txt>
              ) : null}
            </>
          )}
        </View>
        {right}
      </Row>
    );
  } else {
    headerEl = <View style={{ height: top }} />;
  }

  const inner = (
    // Without scrolling the content fills the space (on Android, flex children otherwise get no height).
    <Animated.View style={[frame, !scroll && { flex: 1 }, contentStyle, { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: keyboard.inset }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {headerEl}
      {belowHeader && <View style={frame}>{belowHeader}</View>}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPad, paddingTop: 4 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
      {footer && <View style={[frame, { paddingTop: 10, paddingBottom: insets.bottom + 14 }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

/** Rounded group of header buttons (e.g. "+  •••"), as on the tab roots. */
export function HeaderPill({ children }: { children: React.ReactNode }) {
  const { colors, shadow } = useTheme();
  return <Row style={[{ backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 4, height: 44, gap: 2 }, shadow, { shadowOpacity: shadow.shadowOpacity * 0.7 }]}>{children}</Row>;
}

import { Ionicons } from '@expo/vector-icons';
import { useCalculator, useInputRef } from './Calculator';
import { showDialog } from './dialogStore';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import type { AvailableTone } from '@/engine/budget';
import { FONT, GRADIENT, RADIUS, useLayout, useTheme } from '@/theme';
import { badgeGradient, categoryIcon, type IconName } from '@/utils/icons';
import { formatMoney } from '@/utils/money';
import { cleanTyping } from '@/utils/validation';

export function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/** Confirm dialog in Plan's own style, on every platform. `icon` overrides the badge (an Ionicons name). */
export function confirm(title: string, message: string, confirmLabel = 'OK', destructive = false, icon?: string): Promise<boolean> {
  return showDialog({ title, message, confirmLabel, cancelLabel: 'Cancel', destructive, icon });
}

export function notify(title: string, message?: string) {
  void showDialog({ title, message, confirmLabel: 'OK', cancelLabel: null, destructive: false });
}

// ---------- Typography ----------

const VARIANTS = {
  display: { fontSize: 34, fontFamily: FONT.extrabold, letterSpacing: -0.8 },
  title: { fontSize: 26, fontFamily: FONT.bold, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontFamily: FONT.bold, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontFamily: FONT.bold, letterSpacing: -0.2 },
  body: { fontSize: 15, fontFamily: FONT.medium },
  strong: { fontSize: 15, fontFamily: FONT.semibold },
  label: { fontSize: 13, fontFamily: FONT.semibold },
  caption: { fontSize: 12, fontFamily: FONT.medium },
  overline: { fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: 'uppercase' as const },
} satisfies Record<string, TextStyle>;

export type TxtVariant = keyof typeof VARIANTS;
type Tone = 'default' | 'soft' | 'muted' | 'positive' | 'danger' | 'warning' | 'accent' | 'credit' | 'inverse';

export function Txt({
  variant = 'body',
  tone = 'default',
  style,
  center,
  ...rest
}: TextProps & { variant?: TxtVariant; tone?: Tone; center?: boolean }) {
  const { colors } = useTheme();
  const { scale } = useLayout();
  const toneColor: Record<Tone, string> = {
    default: colors.text,
    soft: colors.textSoft,
    muted: colors.muted,
    positive: colors.positive,
    danger: colors.danger,
    warning: colors.warning,
    accent: colors.accent,
    credit: colors.credit,
    inverse: '#FFFFFF',
  };
  const v = VARIANTS[variant];
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={1.4}
      style={[v, { fontSize: Math.round(v.fontSize * scale), color: toneColor[tone] }, center && { textAlign: 'center' }, style]}
    />
  );
}

export function Money({ value, variant = 'strong', colored, sign, style, compact }: { value: number; variant?: TxtVariant; colored?: boolean; sign?: boolean; style?: StyleProp<TextStyle>; compact?: boolean }) {
  const tone: Tone = colored ? (value < 0 ? 'danger' : value > 0 ? 'positive' : 'muted') : 'default';
  return (
    <Txt variant={variant} tone={tone} style={[{ fontVariant: ['tabular-nums'] }, style]} numberOfLines={1}>
      {formatMoney(value, { sign, compact })}
    </Txt>
  );
}

// ---------- Surfaces ----------

export function Card({ style, children, padded = true, ...rest }: ViewProps & { padded?: boolean }) {
  const { colors, shadow } = useTheme();
  return (
    <View {...rest} style={[{ backgroundColor: colors.surface, borderRadius: RADIUS.lg }, shadow, padded && { padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function GradientCard({ style, children, colors = GRADIENT }: { style?: StyleProp<ViewStyle>; children: React.ReactNode; colors?: readonly [string, string, ...string[]] }) {
  const { isDark } = useTheme();
  return (
    <View style={[styles.gradientShadow, { shadowOpacity: isDark ? 0.4 : 0.28 }, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientCard}>
        {/* soft glossy circles for depth */}
        <View pointerEvents="none" style={[styles.gloss, { top: -60, right: -40 }]} />
        <View pointerEvents="none" style={[styles.gloss, { bottom: -80, left: -30, width: 180, height: 180 }]} />
        {children}
      </LinearGradient>
    </View>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}

export function Row({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[{ flexDirection: 'row', alignItems: 'center' }, style]} />;
}

// ---------- Pressables ----------

export function Tap({ style, scale = false, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scale?: boolean }) {
  return (
    <Pressable
      {...rest}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        style,
        pressed && { opacity: 0.7, transform: scale ? [{ scale: 0.97 }] : undefined },
        hovered && Platform.OS === 'web' && { opacity: 0.85 },
      ]}
    />
  );
}

export function IconButton({ icon, onPress, size = 40, tone = 'surface', label, color, disabled }: { icon: IconName; onPress?: () => void; size?: number; tone?: 'surface' | 'plain' | 'accent'; label: string; color?: string; disabled?: boolean }) {
  const { colors, shadow } = useTheme();
  const bg = tone === 'surface' ? colors.surface : tone === 'accent' ? colors.accentSoft : 'transparent';
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }, tone === 'surface' && shadow]}
    >
      <Ionicons name={icon} size={size * 0.48} color={color ?? (tone === 'accent' ? colors.accent : colors.textSoft)} />
    </Tap>
  );
}

type ButtonVariant = 'gradient' | 'soft' | 'ghost' | 'danger' | 'outline';
export function Button({
  title,
  onPress,
  variant = 'gradient',
  icon,
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const h = small ? 38 : 52;
  const fg = variant === 'gradient' ? '#FFF' : variant === 'danger' ? colors.danger : variant === 'soft' ? colors.accent : colors.text;
  const content = (
    <Row style={{ justifyContent: 'center', gap: 8, height: h, paddingHorizontal: small ? 14 : 20 }}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Txt variant={small ? 'label' : 'strong'} numberOfLines={1} style={{ color: fg, textAlign: 'center', flexShrink: 1 }}>
        {title}
      </Txt>
    </Row>
  );
  const bg: Record<ButtonVariant, ViewStyle> = {
    gradient: {},
    soft: { backgroundColor: colors.accentSoft },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.dangerSoft },
    outline: { borderWidth: 1.5, borderColor: colors.border },
  };
  return (
    <Tap
      scale
      onPress={() => {
        haptic();
        onPress?.();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[{ borderRadius: small ? RADIUS.md : RADIUS.lg, overflow: 'hidden', opacity: disabled ? 0.45 : 1 }, bg[variant], style]}
    >
      {variant === 'gradient' ? (
        // Fills the button even when a row stretches it (e.g. next to an outlined button, which is taller by its border).
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flexGrow: 1, justifyContent: 'center' }}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Tap>
  );
}

export function Chip({ label, active, onPress, icon, count, stretch }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName; count?: number; stretch?: boolean }) {
  const { colors } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        height: 36,
        borderRadius: RADIUS.pill,
        backgroundColor: active ? colors.text : colors.surface,
        borderWidth: active ? 0 : 1,
        borderColor: colors.border,
        ...(stretch ? { flex: 1, justifyContent: 'center' as const, paddingHorizontal: 6 } : null),
      }}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? colors.bg : colors.textSoft} />}
      <Txt variant="label" numberOfLines={1} style={{ color: active ? colors.bg : colors.textSoft }}>
        {label}
      </Txt>
      {count !== undefined && count > 0 && (
        <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: active ? colors.bg : colors.sunken, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Txt variant="caption" style={{ fontSize: 10, color: active ? colors.text : colors.textSoft }}>
            {count}
          </Txt>
        </View>
      )}
    </Tap>
  );
}

/** Segmented control styled like the reference: active segment uses the brand gradient. */
export function Segmented<T extends string>({ options, value, onChange, style }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <Row style={[{ backgroundColor: colors.surface, borderRadius: RADIUS.lg, padding: 5, gap: 4 }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tap
            key={o.value}
            onPress={() => {
              haptic();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, borderRadius: RADIUS.md, overflow: 'hidden' }}
          >
            {active ? (
              <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.segment}>
                <Txt variant="label" tone="inverse" numberOfLines={1}>
                  {o.label}
                </Txt>
              </LinearGradient>
            ) : (
              <View style={styles.segment}>
                <Txt variant="label" tone="muted" numberOfLines={1}>
                  {o.label}
                </Txt>
              </View>
            )}
          </Tap>
        );
      })}
    </Row>
  );
}

// ---------- Data display ----------

export function IconBadge({ name, icon, size = 44, colors: gradient }: { name: string; icon?: IconName; size?: number; colors?: [string, string] }) {
  const g = gradient ?? badgeGradient(name);
  return (
    <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon ?? categoryIcon(name)} size={size * 0.46} color="#FFF" />
    </LinearGradient>
  );
}

export function ProgressBar({ progress, color, height = 6, track }: { progress: number; color?: string; height?: number; track?: string }) {
  const { colors } = useTheme();
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? colors.sunken, overflow: 'hidden' }}>
      {color ? (
        <View style={{ width: `${p * 100}%`, height, borderRadius: height, backgroundColor: color }} />
      ) : (
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: `${p * 100}%`, height, borderRadius: height }} />
      )}
    </View>
  );
}

export function useToneColors(tone: AvailableTone) {
  const { colors } = useTheme();
  switch (tone) {
    case 'positive':
      return { fg: colors.positive, bg: colors.positiveSoft };
    case 'underfunded':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'overspent':
      return { fg: colors.danger, bg: colors.dangerSoft };
    case 'creditOverspent':
      return { fg: colors.credit, bg: colors.creditSoft };
    default:
      return { fg: colors.muted, bg: colors.zeroSoft };
  }
}

export function AvailablePill({ value, tone, width }: { value: number; tone: AvailableTone; width?: number }) {
  const { fg, bg } = useToneColors(tone);
  return (
    <View style={{ backgroundColor: bg, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5, minWidth: 76, width, alignItems: 'flex-end' }}>
      <Txt variant="label" style={{ color: fg, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(value)}
      </Txt>
    </View>
  );
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Row style={[{ justifyContent: 'space-between', marginTop: 22, marginBottom: 12 }, style]}>
      <Txt variant="h3">{title}</Txt>
      {!!action && (
        <Tap onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Txt variant="label" tone="muted">
            {action}
          </Txt>
        </Tap>
      )}
    </Row>
  );
}

export function EmptyState({ icon, title, message, action, onAction }: { icon: IconName; title: string; message?: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Ionicons name={icon} size={32} color={colors.accent} />
      </View>
      <Txt variant="h3" center>
        {title}
      </Txt>
      {!!message && (
        <Txt tone="muted" center style={{ maxWidth: 320 }}>
          {message}
        </Txt>
      )}
      {!!action && <Button title={action} onPress={onAction} variant="soft" small style={{ marginTop: 8 }} />}
    </View>
  );
}

// ---------- Form controls ----------

/** Tappable form row, like the "Category / Note / Today" rows in the reference. */
export function FieldRow({
  icon,
  label,
  value,
  placeholder,
  onPress,
  right,
  valueColor,
  danger,
}: {
  icon: IconName;
  label?: string;
  value?: string;
  placeholder?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  valueColor?: string;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Tap onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={label ?? placeholder} style={[styles.field, { backgroundColor: colors.surface }]}>
      <View style={[styles.fieldIcon, { backgroundColor: danger ? colors.dangerSoft : colors.sunken }]}>
        <Ionicons name={icon} size={15} color={danger ? colors.danger : colors.muted} />
      </View>
      <View style={{ flex: 1 }}>
        {!!label && value ? (
          <Txt variant="caption" tone="muted">
            {label}
          </Txt>
        ) : null}
        <Txt variant="body" numberOfLines={1} style={{ color: valueColor ?? (value ? colors.text : colors.muted) }}>
          {value || placeholder || label}
        </Txt>
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null)}
    </Tap>
  );
}

/**
 * Text input with built-in sanitising: control/invisible characters are stripped and length is capped
 * as the user types. Pass `filter` for stricter fields (e.g. amounts), and `error` to show a message.
 */
export function TextField({
  icon,
  label,
  style,
  containerStyle,
  error,
  filter,
  onChangeText,
  maxLength = 500,
  multiline,
  right,
  calculator,
  ...rest
}: TextInputProps & {
  icon?: IconName;
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  error?: string | null;
  filter?: (text: string) => string;
  right?: React.ReactNode;
  /** Amount fields: show + − × ÷ = keys while focused */
  calculator?: boolean | { allowNegative: boolean };
}) {
  const { colors } = useTheme();
  const inputRef = useInputRef();
  const calc = useCalculator({ value: rest.value ?? '', onChange: (t) => onChangeText?.(t), inputRef, allowNegative: typeof calculator === 'object' && calculator.allowNegative });
  return (
    <View style={containerStyle}>
      {!!label && (
        <Txt variant="label" tone="soft" style={{ marginBottom: 8, marginLeft: 4 }}>
          {label}
        </Txt>
      )}
      <View
        style={[
          styles.field,
          { backgroundColor: colors.surface, paddingVertical: 0, borderWidth: 1.5, borderColor: error ? colors.danger : 'transparent' },
          // Multi-line text starts at the top, so align the icon with the first line instead of the centre.
          multiline && { alignItems: 'flex-start' },
        ]}
      >
        {icon && (
          <View style={[styles.fieldIcon, { backgroundColor: error ? colors.dangerSoft : colors.sunken }, multiline && { marginTop: 12 }]}>
            <Ionicons name={icon} size={15} color={error ? colors.danger : colors.muted} />
          </View>
        )}
        <TextInput
          placeholderTextColor={colors.muted}
          maxLength={maxLength}
          multiline={multiline}
          aria-invalid={!!error}
          {...rest}
          ref={calculator ? inputRef : undefined}
          onFocus={(e) => {
            if (calculator) calc.onFocus();
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            if (calculator) calc.onBlur();
            rest.onBlur?.(e);
          }}
          onChangeText={(t) => onChangeText?.(filter ? filter(t) : cleanTyping(t, maxLength, multiline))}
          style={[
            { flex: 1, minHeight: 54, fontFamily: FONT.medium, fontSize: 15, color: colors.text },
            multiline && { paddingTop: 16, paddingBottom: 16, minHeight: 80, textAlignVertical: 'top' },
            Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
            style,
          ]}
        />
        {right}
      </View>
      {!!calculator && calc.bar}
      {error ? (
        <Row style={{ gap: 6, marginTop: 6, marginLeft: 4 }}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Txt variant="caption" tone="danger" style={{ flex: 1 }} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        </Row>
      ) : null}
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Tap
      onPress={() => {
        haptic();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? colors.accent : colors.sunken, justifyContent: 'center' }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', alignSelf: value ? 'flex-end' : 'flex-start', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  gradientShadow: {
    borderRadius: RADIUS.xl,
    shadowColor: '#B65CF4',
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  gradientCard: { borderRadius: RADIUS.xl, overflow: 'hidden', padding: 22 },
  gloss: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.12)' },
  segment: { height: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  fieldIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

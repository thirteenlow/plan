import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useStore } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';
import { exportBudget } from '@/utils/importExport';
import { saveFile } from '@/utils/saveFile';
import { Button, confirm, haptic, notify, Row, Tap, Txt } from './ui';

const native = Platform.OS !== 'web';
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });
const PATH = [
  { icon: 'settings-outline', label: 'Settings' },
  { icon: 'share-outline', label: 'Export' },
  { icon: 'document-text-outline', label: 'CSV' },
] as const;

/**
 * Shown once after setting a Private password (or asking for a new code): the code, one line on what losing it
 * means, and a small animated pointer to CSV export. Saving it is encouraged, never forced.
 */
export function RecoveryCodeView({ code, onDone, onSkip }: { code: string; onDone: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    haptic('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => saveFile('Plan recovery code.txt', new TextEncoder().encode(`Plan recovery code\n\n${code}\n\nUnlocks your budgets if you forget your password.\n`), 'text/plain');
  const skip = async () => {
    if (await confirm('Skip the recovery code?', 'Forget your password and your budgets are gone for good.', 'Skip', true)) onSkip();
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Txt variant="h2" center>
          Your recovery code
        </Txt>
        <Txt tone="soft" center>
          The only way back in if you forget your password.
        </Txt>
      </View>

      <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSoft, borderRadius: RADIUS.lg, paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center' }}>
        <Txt selectable center style={{ fontFamily: MONO, fontSize: 19, fontWeight: '700', letterSpacing: 1, color: colors.text }} accessibilityLabel={`Recovery code ${code.split('').join(' ')}`}>
          {code}
        </Txt>
      </View>
      <Row style={{ gap: 8 }}>
        <Button title={copied ? 'Copied' : 'Copy'} icon={copied ? 'checkmark' : 'copy-outline'} variant="soft" small style={{ flex: 1 }} onPress={() => void copy()} />
        <Button title="Save as file" icon="download-outline" variant="soft" small style={{ flex: 1 }} onPress={() => void download()} />
      </Row>

      <Row style={{ gap: 8, alignItems: 'flex-start' }}>
        <Ionicons name="warning" size={16} color={colors.danger} style={{ marginTop: 1 }} />
        <Txt variant="caption" style={{ flex: 1, color: colors.danger }}>
          Lose this and your password, and your budgets are gone. Not even Plan can get them back.
        </Txt>
      </Row>

      <Row style={{ gap: 8, flexWrap: 'wrap' }}>
        <Txt variant="caption" tone="soft">
          Back up anytime:
        </Txt>
        <ExportPath />
      </Row>

      <Button title="I’ve saved it" onPress={onDone} />
      <Button title="Skip" variant="ghost" small onPress={() => void skip()} />
    </View>
  );
}

/** "Settings › Export › CSV": steps slide in one after another, then the last keeps pulsing. Tap CSV to export now. */
function ExportPath() {
  const { colors } = useTheme();
  const budget = useStore((s) => (s.activeBudgetId ? s.budgets[s.activeBudgetId] : undefined));
  const [steps] = useState(() => PATH.map(() => new Animated.Value(0)));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const intro = Animated.stagger(
      260,
      steps.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 110, useNativeDriver: native })),
    );
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ]),
    );
    intro.start(() => loop.start());
    return () => {
      intro.stop();
      loop.stop();
    };
  }, [steps, pulse]);

  const exportNow = async () => {
    if (!budget) return;
    try {
      await exportBudget(budget);
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Row style={{ gap: 4 }}>
      {PATH.map((step, i) => {
        const last = i === PATH.length - 1;
        const v = steps[i];
        const grow = v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
        const scale = last ? Animated.add(grow, pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] })) : grow;
        const chip = (
          <Animated.View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: RADIUS.pill,
              backgroundColor: last ? colors.accent : colors.sunken,
              opacity: v,
              transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale }],
            }}
          >
            <Ionicons name={step.icon} size={12} color={last ? '#FFF' : colors.textSoft} />
            <Txt variant="caption" style={{ color: last ? '#FFF' : colors.textSoft, fontWeight: '600' }}>
              {step.label}
            </Txt>
          </Animated.View>
        );
        return (
          <Row key={step.label} style={{ gap: 4 }}>
            {i > 0 && (
              <Animated.View style={{ opacity: v }}>
                <Ionicons name="chevron-forward" size={12} color={colors.muted} />
              </Animated.View>
            )}
            {last && budget ? (
              <Tap onPress={() => void exportNow()} accessibilityRole="button" accessibilityLabel="Export CSV now">
                {chip}
              </Tap>
            ) : (
              chip
            )}
          </Row>
        );
      })}
    </Row>
  );
}

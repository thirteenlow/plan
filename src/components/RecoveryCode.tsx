import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useStore } from '@/store/store';
import { GRADIENT, RADIUS, useTheme } from '@/theme';
import { exportBudget } from '@/utils/importExport';
import { saveFile } from '@/utils/saveFile';
import { Button, Card, haptic, notify, Row, Tap, Txt } from './ui';

const native = Platform.OS !== 'web';
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });
const PATH = [
  { icon: 'settings-outline', label: 'Settings' },
  { icon: 'share-outline', label: 'Export' },
  { icon: 'document-text-outline', label: 'CSV' },
] as const;

/**
 * Shown once after a password is set (or a code is renewed): the recovery code, what losing it means, and a nudge to
 * keep a CSV backup too. Can't be dismissed until the person says they saved the code.
 */
export function RecoveryCodeView({ code, onDone }: { code: string; onDone: () => void }) {
  const { colors } = useTheme();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const budget = useStore((s) => (s.activeBudgetId ? s.budgets[s.activeBudgetId] : undefined));

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    haptic('success');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => saveFile('Plan recovery code.txt', new TextEncoder().encode(`Plan recovery code\n\n${code}\n\nKeep this somewhere safe. It unlocks your budgets if you forget your password.\n`), 'text/plain');
  const exportNow = async () => {
    if (!budget) return;
    try {
      await exportBudget(budget);
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <Ionicons name="key" size={26} color="#FFF" />
        </LinearGradient>
        <Txt variant="h2" center>
          Save your recovery code
        </Txt>
        <Txt tone="soft" center>
          Your only way back in if you forget your password.
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

      <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: RADIUS.lg, backgroundColor: colors.dangerSoft }}>
        <Ionicons name="warning" size={20} color={colors.danger} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="strong" style={{ color: colors.danger }}>
            Lose this and your password, lose your budgets.
          </Txt>
          <Txt variant="caption" tone="soft">
            Not even Plan can get them back.
          </Txt>
        </View>
      </View>

      <Card style={{ gap: 10 }}>
        <Txt variant="strong">Keep your own backup too</Txt>
        <ExportPath />
        {budget && <Button title="Export now" icon="share-outline" variant="outline" small onPress={() => void exportNow()} />}
      </Card>

      <Tap onPress={() => setSaved(!saved)} accessibilityRole="checkbox" accessibilityState={{ checked: saved }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
        <Ionicons name={saved ? 'checkbox' : 'square-outline'} size={22} color={saved ? colors.accent : colors.muted} />
        <Txt variant="body">I’ve saved my recovery code</Txt>
      </Tap>
      <Button title="Done" disabled={!saved} onPress={onDone} />
    </View>
  );
}

/** "Settings → Export → CSV": steps slide in one after another, then the last one keeps pulsing. */
function ExportPath() {
  const { colors } = useTheme();
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

  return (
    <Row style={{ flexWrap: 'wrap', gap: 6 }} accessibilityLabel="Settings, then Export, then CSV">
      {PATH.map((step, i) => {
        const last = i === PATH.length - 1;
        const v = steps[i];
        const scale = last ? Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }), pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] })) : v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
        return (
          <Row key={step.label} style={{ gap: 6 }}>
            {i > 0 && (
              <Animated.View style={{ opacity: v }}>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </Animated.View>
            )}
            <Animated.View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: RADIUS.pill,
                backgroundColor: last ? colors.accent : colors.sunken,
                opacity: v,
                transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }, { scale }],
              }}
            >
              <Ionicons name={step.icon} size={14} color={last ? '#FFF' : colors.textSoft} />
              <Txt variant="label" style={{ color: last ? '#FFF' : colors.textSoft }}>
                {step.label}
              </Txt>
            </Animated.View>
          </Row>
        );
      })}
    </Row>
  );
}

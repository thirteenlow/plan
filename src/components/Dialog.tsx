import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, View } from 'react-native';
import { RADIUS, useTheme } from '@/theme';
import { useDialog } from './dialogStore';
import { Button, Txt } from './ui';

/** Confirm and notice dialogs for the web app, in place of the browser's plain pop-ups. Mounted once at the root. */
export function DialogHost() {
  const current = useDialog((s) => s.current);
  const { colors, shadow } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [current, anim]);

  if (!current) return null;
  const answer = (ok: boolean) => {
    current.resolve(ok);
    useDialog.setState({ current: null });
  };
  const icon = current.destructive ? 'trash-outline' : current.cancelLabel ? 'help-circle-outline' : 'information-circle-outline';
  const tint = current.destructive ? colors.danger : colors.accent;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => answer(false)}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }} onPress={() => answer(false)} accessibilityLabel="Dismiss" />
        <Animated.View
          accessibilityRole="alert"
          style={[
            {
              width: '100%',
              maxWidth: 360,
              backgroundColor: colors.surface,
              borderRadius: RADIUS.xl,
              padding: 22,
              alignItems: 'center',
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
            shadow,
          ]}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: current.destructive ? colors.dangerSoft : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={24} color={tint} />
          </View>
          <Txt variant="h3" center style={{ marginTop: 14 }}>
            {current.title}
          </Txt>
          {!!current.message && (
            <Txt tone="soft" center style={{ marginTop: 6 }}>
              {current.message}
            </Txt>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' }}>
            {current.cancelLabel !== null && <Button title={current.cancelLabel} variant="outline" style={{ flex: 1 }} onPress={() => answer(false)} />}
            <Button title={current.confirmLabel} variant={current.destructive ? 'danger' : 'gradient'} style={{ flex: 1 }} onPress={() => answer(true)} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

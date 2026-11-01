import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, useLayout, useTheme } from '@/theme';
import { Divider, IconButton, Row, Tap, TextField, Txt } from './ui';
import { blurActiveField, isTouchWeb, useKeyboard } from '@/hooks/useKeyboard';
import { LIMITS } from '@/utils/validation';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Let the child manage scrolling (e.g. lists) */
  noScroll?: boolean;
  tall?: boolean;
}

/** Bottom sheet on phones, centred dialog on tablets. */
export function Sheet({ visible, onClose, title, children, noScroll, tall }: SheetProps) {
  const { colors, shadow } = useTheme();
  const { isTablet, height } = useLayout();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  const keyboard = useKeyboard();

  useEffect(() => {
    if (visible) {
      // Opening a sheet from a field shouldn't leave the keyboard of the field behind it open.
      blurActiveField();
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== 'web', damping: 22, stiffness: 220, mass: 0.8 }).start();
    }
  }, [visible, anim]);

  // While the keyboard is up (web), the sheet sits on top of it and fits in the space that's left.
  const room = keyboard.inset && keyboard.visibleHeight ? keyboard.visibleHeight - 16 : height;
  const maxH = isTablet ? Math.min(room * 0.8, 720) : keyboard.inset ? room : room * 0.88;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [isTablet ? 30 : 400, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: isTablet ? 'center' : 'flex-end', alignItems: 'center', paddingBottom: keyboard.inset }}
      >
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Dismiss" />
        <Animated.View
          style={[
            {
              width: '100%',
              maxWidth: isTablet ? 540 : undefined,
              maxHeight: maxH,
              minHeight: tall && !keyboard.inset ? maxH : undefined,
              backgroundColor: colors.bg,
              borderTopLeftRadius: RADIUS.xl,
              borderTopRightRadius: RADIUS.xl,
              borderBottomLeftRadius: isTablet ? RADIUS.xl : 0,
              borderBottomRightRadius: isTablet ? RADIUS.xl : 0,
              paddingBottom: isTablet || keyboard.inset ? 12 : insets.bottom + 12,
              transform: [{ translateY }],
              opacity: anim,
            },
            shadow,
          ]}
        >
          {!isTablet && <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 }} />}
          {title !== undefined && (
            <Row style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}>
              <Txt variant="h2" style={{ flex: 1 }} numberOfLines={1}>
                {title}
              </Txt>
              <IconButton icon="close" label="Close" onPress={onClose} size={34} tone="plain" />
            </Row>
          )}
          {noScroll ? (
            <View style={{ flexShrink: 1 }}>{children}</View>
          ) : (
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface PickerItem {
  key: string;
  title: string;
  subtitle?: string;
  section?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  disabled?: boolean;
}

/** Searchable list picker used for payees, categories, accounts, etc. */
export function PickerSheet({
  visible,
  onClose,
  title,
  items,
  selectedKey,
  onSelect,
  onCreate,
  createLabel = 'Create',
  searchPlaceholder = 'Search',
  searchable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: PickerItem[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
  onCreate?: (query: string) => void;
  createLabel?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} noScroll tall={items.length > 8}>
      {visible && <PickerBody {...{ items, selectedKey, onSelect, onCreate, createLabel, searchPlaceholder, searchable }} />}
    </Sheet>
  );
}

function PickerBody({
  items,
  selectedKey,
  onSelect,
  onCreate,
  createLabel,
  searchPlaceholder,
  searchable,
}: {
  items: PickerItem[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
  onCreate?: (query: string) => void;
  createLabel: string;
  searchPlaceholder: string;
  searchable: boolean;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');

  const sections = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = query ? items.filter((i) => i.title.toLowerCase().includes(query) || i.section?.toLowerCase().includes(query)) : items;
    const map = new Map<string, PickerItem[]>();
    for (const i of filtered) {
      const s = i.section ?? '';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(i);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [items, q]);

  const exact = items.some((i) => i.title.toLowerCase() === q.trim().toLowerCase());

  return (
    <>
      {searchable && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <TextField maxLength={LIMITS.search} icon="search" placeholder={searchPlaceholder} value={q} onChangeText={setQ} autoFocus={Platform.OS === 'web' && !isTouchWeb()} autoCorrect={false} returnKeyType="done" />
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.key}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
        ListHeaderComponent={
          onCreate && q.trim() && !exact ? (
            <Tap onPress={() => onCreate(q.trim())} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="add" size={20} color={colors.accent} />
              </View>
              <Txt variant="strong" tone="accent">
                {createLabel} “{q.trim()}”
              </Txt>
            </Tap>
          ) : undefined
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Txt variant="overline" tone="muted" style={{ marginTop: 16, marginBottom: 6 }}>
              {section.title}
            </Txt>
          ) : null
        }
        ItemSeparatorComponent={() => <Divider />}
        renderItem={({ item }) => {
          const selected = item.key === selectedKey;
          return (
            <Tap
              disabled={item.disabled}
              onPress={() => onSelect(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: item.disabled ? 0.4 : 1 }}
            >
              {item.left}
              <View style={{ flex: 1 }}>
                <Txt variant="strong" numberOfLines={1} style={selected ? { color: colors.accent } : undefined}>
                  {item.title}
                </Txt>
                {item.subtitle ? (
                  <Txt variant="caption" tone="muted" numberOfLines={1}>
                    {item.subtitle}
                  </Txt>
                ) : null}
              </View>
              {item.right}
              {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
            </Tap>
          );
        }}
        ListEmptyComponent={
          <Txt tone="muted" center style={{ paddingVertical: 32 }}>
            Nothing found
          </Txt>
        }
      />
    </>
  );
}

/** Simple action menu (used for "more" buttons). */
export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; destructive?: boolean; hint?: string }[];
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? ''}>
      {actions.map((a, i) => (
        <React.Fragment key={a.label}>
          {i > 0 && <Divider inset={48} />}
          <Tap
            onPress={() => {
              onClose();
              setTimeout(a.onPress, Platform.OS === 'ios' ? 350 : 0);
            }}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: a.destructive ? colors.dangerSoft : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={a.icon} size={17} color={a.destructive ? colors.danger : colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="strong" tone={a.destructive ? 'danger' : 'default'}>
                {a.label}
              </Txt>
              {!!a.hint && (
                <Txt variant="caption" tone="muted">
                  {a.hint}
                </Txt>
              )}
            </View>
          </Tap>
        </React.Fragment>
      ))}
    </Sheet>
  );
}

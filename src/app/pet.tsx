import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import { FREE_PETS, requirePro, useIsPro } from '@/cloud/pro';
import { PetSprite, usePetMood, useTickle } from '@/components/Pet';
import { EGG, PixelArt, PixelPet } from '@/components/PixelPet';
import { Screen } from '@/components/Screen';
import { Card, haptic, ProgressBar, Row, SectionTitle, Tap, TextField, Toggle, Txt } from '@/components/ui';
import { MOODS, PETS, petInfo, type Mood } from '@/engine/pet';
import { useActiveBudget, useStore } from '@/store/store';
import type { PetKind } from '@/store/types';
import { RADIUS, useTheme } from '@/theme';

/** Pick a companion that roams the app; its mood follows how this month's budget is going. */
export default function PetScreen() {
  const data = useActiveBudget();
  const updateSettings = useStore((s) => s.updateSettings);
  const mood = usePetMood();
  const { colors } = useTheme();
  const pet = data.settings.pet;
  const [name, setName] = useState(pet?.name ?? '');
  const tickle = useTickle();

  const pro = useIsPro();
  const choose = (kind: PetKind) => {
    if (!FREE_PETS.includes(kind) && !requirePro('pets')) return;
    haptic('success');
    // Keep a custom name; otherwise use the animal's default.
    const custom = pet && pet.name !== petInfo(pet.kind).name ? pet.name : null;
    const next = custom ?? petInfo(kind).name;
    setName(next);
    updateSettings({ pet: { kind, name: next, hidden: pet?.hidden } });
  };

  const m = mood?.mood ?? 'happy';
  const moodColor = m === 'thriving' || m === 'happy' ? colors.positive : m === 'okay' ? colors.accent : colors.danger;

  return (
    <Screen back="close" modal title="Companion" maxWidth={560}>
      <View style={{ gap: 18 }}>
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 26 }}>
          {pet ? (
            <>
              <Tap
                onPress={() => {
                  haptic();
                  tickle.tap();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Tickle ${pet.name}`}
                style={{ height: 112, justifyContent: 'flex-end' }}
              >
                <PetSprite kind={pet.kind} mood={tickle.tickled ? 'thriving' : m} size={96} heart={tickle.tickled} />
              </Tap>
              <Txt variant="h2" center>
                {tickle.tickled ? `${pet.name} is giggling` : `${pet.name} is ${MOODS[m].label.toLowerCase()}`}
              </Txt>
              <Txt variant="caption" tone="muted" center>
                Tap three times to tickle
              </Txt>
              <View style={{ alignSelf: 'stretch', gap: 6, paddingHorizontal: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="caption" tone="muted">
                    Happiness
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {mood?.score ?? 70}/100
                  </Txt>
                </Row>
                <ProgressBar progress={(mood?.score ?? 70) / 100} color={moodColor} height={8} />
              </View>
              <Row style={{ alignSelf: 'stretch', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
                {(Object.keys(MOODS) as Mood[]).map((k) => (
                  <View key={k} style={{ alignItems: 'center', gap: 2, opacity: k === m ? 1 : 0.4 }}>
                    <PixelPet kind={pet.kind} mood={k} size={32} />
                    <Txt variant="caption" tone={k === m ? 'accent' : 'muted'}>
                      {MOODS[k].label}
                    </Txt>
                  </View>
                ))}
              </Row>
            </>
          ) : (
            <>
              <PixelArt grid={EGG.grid} palette={EGG.palette} size={72} />
              <Txt variant="h2" center>
                Pick a companion
              </Txt>
              <Txt tone="soft" center>
                It wanders around the app and its mood follows your spending.
              </Txt>
            </>
          )}
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {PETS.map((p) => {
            const on = pet?.kind === p.kind;
            const locked = !pro && !FREE_PETS.includes(p.kind);
            return (
              <Tap
                key={p.kind}
                scale
                onPress={() => choose(p.kind)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={locked ? `${p.label}, Pro` : p.label}
                style={{
                  width: '22.5%',
                  flexGrow: 1,
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 12,
                  borderRadius: RADIUS.lg,
                  borderWidth: 2,
                  borderColor: on ? colors.accent : colors.border,
                  backgroundColor: on ? colors.accentSoft : colors.surface,
                }}
              >
                <View style={{ opacity: locked ? 0.55 : 1 }}>
                  <PixelPet kind={p.kind} mood="happy" size={48} />
                </View>
                <Txt variant="caption" tone={on ? 'accent' : 'soft'}>
                  {p.label}
                </Txt>
                {locked && (
                  <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.accent, borderRadius: RADIUS.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Ionicons name="lock-closed" size={9} color={colors.onGradient} />
                    <Txt variant="caption" style={{ color: colors.onGradient, fontSize: 10 }}>
                      PRO
                    </Txt>
                  </View>
                )}
              </Tap>
            );
          })}
        </View>

        {pet && (
          <>
            <Card style={{ gap: 12 }}>
              <TextField
                label="Name"
                value={name}
                maxLength={20}
                onChangeText={setName}
                onBlur={() => updateSettings({ pet: { ...pet, name: name.trim() || petInfo(pet.kind).name } })}
              />
              <Row style={{ justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="strong">Show around the app</Txt>
                  <Txt variant="caption" tone="muted">
                    Tap for a status, tap 3× to tickle, drag to move.
                  </Txt>
                </View>
                <Toggle label="Show around the app" value={!pet.hidden} onChange={(v) => updateSettings({ pet: { ...pet, hidden: !v } })} />
              </Row>
            </Card>

            <SectionTitle title="Why it feels this way" />
            <Card style={{ gap: 12 }}>
              {(mood?.reasons ?? []).map((r) => (
                <Row key={r.text} style={{ gap: 10, alignItems: 'flex-start' }}>
                  <Ionicons name={r.tone === 'good' ? 'arrow-up-circle' : 'arrow-down-circle'} size={18} color={r.tone === 'good' ? colors.positive : colors.danger} style={{ marginTop: 1 }} />
                  <Txt style={{ flex: 1 }}>{r.text}</Txt>
                </Row>
              ))}
            </Card>
            <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
              Its mood follows this month: overspending, spending pace, targets, card debt and savings.
            </Txt>
          </>
        )}
      </View>
    </Screen>
  );
}

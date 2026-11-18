import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Button, Card, haptic, Row, Tap, Txt } from '@/components/ui';
import { RADIUS, useTheme } from '@/theme';
import { activeMonthStarts, addMonths, currentMonth, monthDates, ordinal, startDayFor, withMonthStart } from '@/utils/date';
import type { MonthStart } from '@/store/types';

/**
 * Picks how budget months run: calendar months, or from pay day (a day from 2 to 28, picked on a calendar grid). The choice applies from
 * this month on: this month keeps its start and ends the day before the new one; earlier months never move.
 */
export function MonthStartSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (starts: MonthStart[]) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="How your months run">
      {/* Mounted only while open, so it starts from the saved day each time. */}
      {visible && <MonthStartBody onClose={onClose} onSave={onSave} />}
    </Sheet>
  );
}

type Mode = 'calendar' | 'payday';

function MonthStartBody({ onClose, onSave }: { onClose: () => void; onSave: (starts: MonthStart[]) => void }) {
  const { colors } = useTheme();
  const thisMonth = currentMonth();
  const next = addMonths(thisMonth, 1);
  // The day in force from next month (this one keeps the start it has).
  const current = startDayFor(next);
  const [mode, setMode] = useState<Mode>(current === 1 ? 'calendar' : 'payday');
  // The pay day picked in the grid (kept while flipping between the two choices).
  const [payDay, setPayDay] = useState<number | null>(current === 1 ? null : current);
  const day = mode === 'calendar' ? 1 : payDay;

  const starts = withMonthStart(activeMonthStarts(), thisMonth, day ?? current);
  const dates = (m: string) => monthDates(m, starts, undefined, true);
  // Pay days: the 2nd to the 28th (every month has those), in rows of 7 like a calendar.
  const days = Array.from({ length: 27 }, (_, i) => i + 2);
  const changed = day !== null && day !== current;

  return (
    <>
      <Choice
        icon="calendar-outline"
        title="Calendar months"
        hint="1st to the last day of the month"
        selected={mode === 'calendar'}
        onPress={() => setMode('calendar')}
      />
      <Choice
        icon="cash-outline"
        title="From pay day"
        hint={payDay ? `The ${ordinal(payDay)} to the ${ordinal(payDay - 1)} of the next month` : 'Each month runs from one pay to the next'}
        selected={mode === 'payday'}
        onPress={() => setMode('payday')}
      />

      {mode === 'payday' && (
        <View style={{ marginTop: 6 }}>
          <Txt variant="strong" style={{ marginBottom: 8 }}>
            Which day are you paid?
          </Txt>
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, row) => {
            const week = days.slice(row * 7, row * 7 + 7);
            return (
              <Row key={row}>
                {week.map((d) => {
                  const selected = d === payDay;
                  return (
                    <Tap
                      key={d}
                      onPress={() => {
                        haptic();
                        setPayDay(d);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Paid on the ${ordinal(d)}`}
                      style={{ flex: 1, aspectRatio: 1, padding: 3, maxHeight: 50 }}
                    >
                      <View
                        style={{
                          flex: 1,
                          borderRadius: RADIUS.md,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: selected ? colors.accent : colors.surface,
                        }}
                      >
                        <Txt variant="strong" style={{ color: selected ? '#FFF' : colors.text }}>
                          {d}
                        </Txt>
                      </View>
                    </Tap>
                  );
                })}
                {/* Keep the last row's days the same size as the others. */}
                {Array.from({ length: 7 - week.length }, (_, i) => (
                  <View key={`pad${i}`} style={{ flex: 1, aspectRatio: 1, padding: 3, maxHeight: 50 }} />
                ))}
              </Row>
            );
          })}
          <Txt variant="caption" tone="muted" style={{ marginTop: 6 }}>
            Paid on the 29th, 30th or 31st? Pick the 28th, since every month has one.
          </Txt>
        </View>
      )}

      {day !== null && (
        <Card style={{ marginTop: 16, gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt tone="muted">This month</Txt>
            <Txt variant="strong">{dates(thisMonth)}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt tone="muted">Next month</Txt>
            <Txt variant="strong">{dates(next)}</Txt>
          </Row>
          {changed && (
            <Txt variant="caption" tone="muted">
              Earlier months stay as they are, so nothing you spent or assigned in them moves.
            </Txt>
          )}
        </Card>
      )}

      <Button
        title={day === null ? 'Pick the day you’re paid' : !changed ? 'Done' : day === 1 ? 'Use calendar months' : `Start months on the ${ordinal(day)}`}
        disabled={day === null}
        style={{ marginTop: 16 }}
        onPress={() => {
          if (changed) {
            haptic('success');
            onSave(starts);
          }
          onClose();
        }}
      />
    </>
  );
}

/** One of the two ways months can run: a radio card with an icon, a title and what it means. */
function Choice({ icon, title, hint, selected, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; hint: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      onPress={() => {
        haptic();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}: ${hint}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        marginBottom: 10,
        borderRadius: RADIUS.lg,
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
      }}
    >
      <Ionicons name={icon} size={22} color={selected ? colors.accent : colors.muted} />
      <View style={{ flex: 1 }}>
        <Txt variant="strong" style={{ color: selected ? colors.accent : colors.text }}>
          {title}
        </Txt>
        <Txt variant="caption" tone="muted">
          {hint}
        </Txt>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.accent : colors.muted} />
    </Tap>
  );
}

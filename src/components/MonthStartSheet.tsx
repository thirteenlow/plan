import React, { useState } from 'react';
import { View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Button, Card, haptic, Row, Tap, Txt } from '@/components/ui';
import { RADIUS, useTheme } from '@/theme';
import { activeMonthStarts, addMonths, currentMonth, monthDates, ordinal, startDayFor, withMonthStart } from '@/utils/date';
import type { MonthStart } from '@/store/types';

/**
 * Picks the day budget months start on, as a calendar of days 1–28 (every month has those). The choice applies from
 * this month on: this month keeps its start and ends the day before the new one; earlier months never move.
 */
export function MonthStartSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (starts: MonthStart[]) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Month starts on">
      {/* Mounted only while open, so it starts from the saved day each time. */}
      {visible && <MonthStartBody onClose={onClose} onSave={onSave} />}
    </Sheet>
  );
}

function MonthStartBody({ onClose, onSave }: { onClose: () => void; onSave: (starts: MonthStart[]) => void }) {
  const { colors } = useTheme();
  const thisMonth = currentMonth();
  const next = addMonths(thisMonth, 1);
  // The day in force from next month (this one keeps the start it has).
  const current = startDayFor(next);
  const [day, setDay] = useState(current);

  const starts = withMonthStart(activeMonthStarts(), thisMonth, day);
  const dates = (m: string) => monthDates(m, starts) ?? 'Calendar month';
  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <>
      <Txt tone="muted" style={{ marginBottom: 14 }}>
        Pick your pay day, so each month runs from one pay to the next.
      </Txt>
      {Array.from({ length: 4 }, (_, row) => (
        <Row key={row}>
          {days.slice(row * 7, row * 7 + 7).map((d) => {
            const selected = d === day;
            const isCurrent = d === current;
            return (
              <Tap
                key={d}
                onPress={() => {
                  haptic();
                  setDay(d);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`The ${ordinal(d)}`}
                style={{ flex: 1, aspectRatio: 1, padding: 3, maxHeight: 54 }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: RADIUS.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.accent : isCurrent ? colors.accentSoft : 'transparent',
                  }}
                >
                  <Txt variant="strong" style={{ color: selected ? '#FFF' : isCurrent ? colors.accent : colors.text }}>
                    {d}
                  </Txt>
                </View>
              </Tap>
            );
          })}
        </Row>
      ))}
      <Txt variant="caption" tone="muted" center style={{ marginTop: 6 }}>
        Up to the 28th, so every month has the day. Paid on the 29th–31st? Pick the 28th.
      </Txt>

      <Card style={{ marginTop: 16, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt tone="muted">This month</Txt>
          <Txt variant="strong">{dates(thisMonth)}</Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt tone="muted">Then</Txt>
          <Txt variant="strong">{dates(next)}</Txt>
        </Row>
        <Txt variant="caption" tone="muted">
          Earlier months stay as they are, so nothing you spent or assigned in them moves.
        </Txt>
      </Card>

      <Button
        title={day === current ? 'Done' : day === 1 ? 'Use calendar months' : `Start on the ${ordinal(day)}`}
        style={{ marginTop: 16 }}
        onPress={() => {
          if (day !== current) {
            haptic('success');
            onSave(starts);
          }
          onClose();
        }}
      />
    </>
  );
}

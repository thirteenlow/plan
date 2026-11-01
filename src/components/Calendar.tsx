import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import { RADIUS, useTheme } from '@/theme';
import { addDays, addMonths, daysInMonth, monthOf, parseISO, today, WEEKDAYS_SHORT } from '@/utils/date';
import type { ISODate } from '@/store/types';
import { Sheet } from './Sheet';
import { Button, Chip, IconButton, Row, Tap, Txt } from './ui';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function CalendarSheet({ visible, onClose, value, onChange, title = 'Date' }: { visible: boolean; onClose: () => void; value: ISODate; onChange: (d: ISODate) => void; title?: string }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {visible && <CalendarBody value={value} onChange={onChange} onClose={onClose} />}
    </Sheet>
  );
}

function CalendarBody({ value, onChange, onClose }: { value: ISODate; onChange: (d: ISODate) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [month, setMonth] = useState(monthOf(value));
  // Tap the month or the year in the header to jump straight to it, instead of paging month by month.
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const year = Number(month.slice(0, 4));
  const firstYear = year - 1; // mostly upcoming years: due dates are in the future more often than not
  const step = mode === 'days' ? 1 : mode === 'months' ? 12 : 144;
  const stepLabel = mode === 'days' ? 'month' : mode === 'months' ? 'year' : '12 years';

  const first = parseISO(`${month}-01`).getDay();
  const n = daysInMonth(month);
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const t = today();

  const pick = (d: ISODate) => {
    onChange(d);
    onClose();
  };

  return (
    <>
      <Row style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Chip label="Today" onPress={() => pick(t)} active={value === t} />
        <Chip label="Yesterday" onPress={() => pick(addDays(t, -1))} active={value === addDays(t, -1)} />
        <Chip label="Tomorrow" onPress={() => pick(addDays(t, 1))} active={value === addDays(t, 1)} />
      </Row>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <IconButton icon="chevron-back" label={`Previous ${stepLabel}`} onPress={() => setMonth(addMonths(month, -step))} size={34} />
        <Row style={{ gap: 6 }}>
          <HeaderPill label={MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} open={mode === 'months'} onPress={() => setMode(mode === 'months' ? 'days' : 'months')} a11y="Choose month" />
          <HeaderPill label={mode === 'years' ? `${firstYear}–${firstYear + 11}` : String(year)} open={mode === 'years'} onPress={() => setMode(mode === 'years' ? 'days' : 'years')} a11y="Choose year" />
        </Row>
        <IconButton icon="chevron-forward" label={`Next ${stepLabel}`} onPress={() => setMonth(addMonths(month, step))} size={34} />
      </Row>
      {mode === 'months' ? (
        <Grid
          items={MONTHS_SHORT.map((label, i) => ({ key: `${year}-${String(i + 1).padStart(2, '0')}`, label, a11y: `${label} ${year}` }))}
          selected={monthOf(value)}
          current={month}
          onPick={(m) => {
            setMonth(m);
            setMode('days');
          }}
        />
      ) : mode === 'years' ? (
        <Grid
          items={Array.from({ length: 12 }, (_, i) => ({ key: String(firstYear + i), label: String(firstYear + i), a11y: String(firstYear + i) }))}
          selected={value.slice(0, 4)}
          current={String(year)}
          onPick={(y) => {
            setMonth(`${y}-${month.slice(5, 7)}`);
            setMode('months');
          }}
        />
      ) : (
        <>
          <Row>
            {WEEKDAYS_SHORT.map((d) => (
              <Txt key={d} variant="caption" tone="muted" center style={{ flex: 1, marginBottom: 6 }}>
                {d.slice(0, 2)}
              </Txt>
            ))}
          </Row>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <Row key={row}>
              {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
                if (!day) return <View key={i} style={{ flex: 1, aspectRatio: 1 }} />;
                const iso = `${month}-${String(day).padStart(2, '0')}`;
                const selected = iso === value;
                const isToday = iso === t;
                return (
                  <Tap key={i} onPress={() => pick(iso)} accessibilityLabel={iso} style={{ flex: 1, aspectRatio: 1, padding: 3, maxHeight: 54 }}>
                    <View
                      style={{
                        flex: 1,
                        borderRadius: RADIUS.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? colors.accent : isToday ? colors.accentSoft : 'transparent',
                      }}
                    >
                      <Txt variant="strong" style={{ color: selected ? '#FFF' : isToday ? colors.accent : colors.text }}>
                        {day}
                      </Txt>
                    </View>
                  </Tap>
                );
              })}
            </Row>
          ))}
        </>
      )}
      <Button title="Done" variant="soft" small onPress={onClose} style={{ marginTop: 12 }} />
    </>
  );
}

function HeaderPill({ label, open, onPress, a11y }: { label: string; open: boolean; onPress: () => void; a11y: string }) {
  const { colors } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: open ? colors.accent : colors.accentSoft }}
    >
      <Txt variant="h3" style={{ color: open ? '#FFF' : colors.accent }}>
        {label}
      </Txt>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={open ? '#FFF' : colors.accent} />
    </Tap>
  );
}

/** 3-column grid of months or years. */
function Grid({ items, selected, current, onPick }: { items: { key: string; label: string; a11y: string }[]; selected: string; current: string; onPick: (key: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
      {items.map((it) => {
        const active = it.key === selected;
        return (
          <Tap key={it.key} onPress={() => onPick(it.key)} accessibilityLabel={it.a11y} style={{ width: '33.33%', padding: 4 }}>
            <View style={{ height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.accent : it.key === current ? colors.accentSoft : colors.surfaceAlt }}>
              <Txt variant="strong" style={{ color: active ? '#FFF' : colors.text }}>
                {it.label}
              </Txt>
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

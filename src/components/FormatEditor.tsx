import React, { useState } from 'react';
import { View } from 'react-native';
import type { CurrencyFormat, DateFormat } from '@/store/types';
import { RADIUS, useTheme } from '@/theme';
import { shortDate, today } from '@/utils/date';
import { CURRENCIES, type CurrencyPreset, formatMoney, formatNumber, NUMBER_FORMATS } from '@/utils/money';
import { cleanSymbol, LIMITS } from '@/utils/validation';
import { PickerSheet } from './Sheet';
import { Card, FieldRow, Row, Segmented, Tap, TextField, Txt } from './ui';

export interface FormatValue {
  currency: CurrencyFormat;
  dateFormat: DateFormat;
}

const SAMPLE = 1234567890; // 1,234,567.89 in milliunits

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', SG: 'SGD', GB: 'GBP', AU: 'AUD', CA: 'CAD', NZ: 'NZD', MY: 'MYR', ID: 'IDR', TH: 'THB', PH: 'PHP', VN: 'VND', HK: 'HKD',
  CN: 'CNY', JP: 'JPY', KR: 'KRW', TW: 'TWD', IN: 'INR', AE: 'AED', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', BR: 'BRL',
  MX: 'MXN', ZA: 'ZAR', KW: 'KWD', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
};

/** Best guess from the device locale (e.g. "en-SG" → SGD, day-month-year). Falls back to USD. */
export function guessFormat(): FormatValue {
  let region = '';
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Z]{2}$/.test(part)) ?? '';
  } catch {
    // Intl unavailable: use defaults.
  }
  const preset = CURRENCIES.find((c) => c.code === REGION_CURRENCY[region]) ?? CURRENCIES[0];
  const { name: _name, ...currency } = preset;
  return { currency, dateFormat: region === 'US' ? 'MDY' : region === 'CN' || region === 'JP' || region === 'KR' || region === 'TW' ? 'YMD' : 'DMY' };
}

/** Currency, number and date formatting choices with a live preview. */
export function FormatEditor({ value, onChange }: { value: FormatValue; onChange: (v: FormatValue) => void }) {
  const { colors } = useTheme();
  const [picker, setPicker] = useState(false);
  const c = value.currency;
  const preset = CURRENCIES.find((p) => p.code === c.code);
  const set = (patch: Partial<CurrencyFormat>) => onChange({ ...value, currency: { ...c, ...patch } });
  const placement: 'before' | 'after' | 'none' = c.showSymbol === false ? 'none' : c.symbolFirst ? 'before' : 'after';

  const pickPreset = (p: CurrencyPreset) => {
    const { name: _name, ...currency } = p;
    onChange({ ...value, currency });
  };

  return (
    <View style={{ gap: 18 }}>
      <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 20 }}>
        <Txt variant="overline" tone="muted">
          Preview
        </Txt>
        <Txt variant="title" numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(SAMPLE, { c })}
        </Txt>
        <Row style={{ gap: 14 }}>
          <Txt tone="danger">{formatMoney(-45500, { c })}</Txt>
          <Txt tone="soft">{shortDate(today(), value.dateFormat)}</Txt>
        </Row>
      </Card>

      <View>
        <Label>Currency</Label>
        <FieldRow icon="cash-outline" value={`${c.code}${preset ? ` · ${preset.name}` : ''}`} onPress={() => setPicker(true)} />
      </View>

      <View>
        <Label>Currency symbol</Label>
        <TextField
          icon="pricetag-outline"
          value={c.symbol}
          onChangeText={(symbol) => set({ symbol })}
          filter={cleanSymbol}
          maxLength={LIMITS.symbol}
          placeholder="e.g. $"
          autoCorrect={false}
          autoCapitalize="characters"
        />
      </View>

      <View>
        <Label>Symbol placement</Label>
        <Segmented
          value={placement}
          onChange={(p) => set(p === 'none' ? { showSymbol: false } : { showSymbol: true, symbolFirst: p === 'before' })}
          options={[
            { value: 'before', label: `Before · ${formatMoney(123000, { c: { ...c, showSymbol: true, symbolFirst: true, decimals: 0 } })}` },
            { value: 'after', label: `After · ${formatMoney(123000, { c: { ...c, showSymbol: true, symbolFirst: false, decimals: 0 } })}` },
            { value: 'none', label: 'Hide' },
          ]}
        />
      </View>

      <View>
        <Label>Number format</Label>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {NUMBER_FORMATS.map((f) => {
            const active = f.group === c.group && f.decimal === c.decimal;
            const example = formatNumber(SAMPLE, { ...c, ...f, decimals: Math.max(c.decimals, 2) });
            return (
              <Tap
                key={`${f.group}|${f.decimal}`}
                onPress={() => set(f)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Number format ${example}`}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: RADIUS.md,
                  backgroundColor: active ? colors.accentSoft : colors.surface,
                  borderWidth: 1.5,
                  borderColor: active ? colors.accent : colors.border,
                }}
              >
                <Txt variant="strong" style={{ color: active ? colors.accent : colors.text, fontVariant: ['tabular-nums'] }}>
                  {example}
                </Txt>
              </Tap>
            );
          })}
        </Row>
      </View>

      <View>
        <Label>Decimal places</Label>
        <Segmented
          value={String(c.decimals) as '0' | '2' | '3'}
          onChange={(d) => set({ decimals: Number(d) })}
          options={[
            { value: '0', label: formatNumber(123000, { ...c, decimals: 0 }) },
            { value: '2', label: formatNumber(123450, { ...c, decimals: 2 }) },
            { value: '3', label: formatNumber(123456, { ...c, decimals: 3 }) },
          ]}
        />
      </View>

      <View>
        <Label>Date format</Label>
        <Segmented<DateFormat>
          value={value.dateFormat}
          onChange={(dateFormat) => onChange({ ...value, dateFormat })}
          options={(['DMY', 'MDY', 'YMD'] as const).map((f) => ({ value: f, label: shortDate(today(), f) }))}
        />
      </View>

      <PickerSheet
        visible={picker}
        onClose={() => setPicker(false)}
        title="Currency"
        selectedKey={c.code}
        searchPlaceholder="Search currencies"
        items={CURRENCIES.map((p) => ({ key: p.code, title: `${p.code} · ${p.name}`, subtitle: formatMoney(SAMPLE, { c: p }) }))}
        onSelect={(k) => {
          const p = CURRENCIES.find((x) => x.code === k);
          if (p) pickPreset(p);
          setPicker(false);
        }}
      />
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Txt variant="label" tone="soft" style={{ marginBottom: 8, marginLeft: 4 }}>
      {children}
    </Txt>
  );
}

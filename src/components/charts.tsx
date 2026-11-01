import React, { useId, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { FONT, GRADIENT, useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';
import { Row, Tap, Txt } from './ui';

function useWidth(initial = 320) {
  const [w, setW] = useState(initial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.max(120, e.nativeEvent.layout.width)) };
}

/** Vertical pill bars with a gradient fill, like the reference "Transactions" chart. */
export function BarChart({
  data,
  height = 200,
  selected,
  onSelect,
  marker,
}: {
  data: { label: string; value: number; secondary?: number }[];
  height?: number;
  selected?: number;
  onSelect?: (i: number) => void;
  /** Dashed vertical marker with a pill label above a bar (e.g. "Started Plan") */
  marker?: { index: number; label: string };
}) {
  const { colors } = useTheme();
  const { w, onLayout } = useWidth();
  const barId = useSvgId('bar');
  const axisW = 44;
  const top = marker ? 30 : 10;
  const chartH = height - 26 - top;
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  const nice = niceMax(max);
  const slot = (w - axisW) / Math.max(data.length, 1);
  const barW = Math.min(14, slot * 0.42);
  const ticks = [0.25, 0.5, 0.75, 1];

  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id={barId} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={GRADIENT[2]} />
            <Stop offset="0.5" stopColor={GRADIENT[1]} />
            <Stop offset="1" stopColor={GRADIENT[0]} />
          </LinearGradient>
        </Defs>
        {ticks.map((t) => (
          <SvgText key={t} x={0} y={top + chartH - chartH * t + 4} fontSize={10} fill={colors.muted} fontFamily={FONT.medium}>
            {formatMoney(nice * t * 1000, { compact: true }).replace(/\.00$/, '')}
          </SvgText>
        ))}
        {marker && marker.index >= 0 && marker.index < data.length && (() => {
          const mx = axisW + slot * marker.index + slot / 2;
          const w = marker.label.length * 6.2 + 18;
          const pillX = Math.max(0, mx - w / 2);
          return (
            <G>
              <Line x1={mx} x2={mx} y1={20} y2={top + chartH} stroke={colors.accent} strokeWidth={1.5} strokeDasharray="4 4" />
              <Rect x={pillX} y={2} width={w} height={20} rx={10} fill={colors.accent} />
              <SvgText x={pillX + w / 2} y={16} fontSize={10.5} fill="#FFF" textAnchor="middle" fontFamily={FONT.semibold}>
                {marker.label}
              </SvgText>
            </G>
          );
        })()}
        {data.map((d, i) => {
          const cx = axisW + slot * i + slot / 2;
          const h = (d.value / nice) * chartH;
          const dim = selected !== undefined && selected !== i;
          const pairOffset = d.secondary !== undefined ? barW * 0.7 : 0;
          return (
            <G key={i} opacity={dim ? 0.45 : 1}>
              <Rect x={cx - barW / 2 - pairOffset} y={top} width={barW} height={chartH} rx={barW / 2} fill={colors.sunken} />
              {h > 0 && <Rect x={cx - barW / 2 - pairOffset} y={top + chartH - Math.max(h, barW)} width={barW} height={Math.max(h, barW)} rx={barW / 2} fill={`url(#${barId})`} />}
              {d.secondary !== undefined && (
                <>
                  <Rect x={cx - barW / 2 + pairOffset} y={top} width={barW} height={chartH} rx={barW / 2} fill={colors.sunken} />
                  {d.secondary > 0 && (
                    <Rect
                      x={cx - barW / 2 + pairOffset}
                      y={top + chartH - Math.max((d.secondary / nice) * chartH, barW)}
                      width={barW}
                      height={Math.max((d.secondary / nice) * chartH, barW)}
                      rx={barW / 2}
                      fill={colors.positive}
                    />
                  )}
                </>
              )}
              <SvgText x={cx} y={height - 6} fontSize={10} fill={colors.muted} textAnchor="middle" fontFamily={FONT.medium}>
                {d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {onSelect && (
        <Row style={{ position: 'absolute', left: axisW, right: 0, top: 0, bottom: 0 }}>
          {data.map((d, i) => (
            <Tap key={i} style={{ flex: 1, height: '100%' }} onPress={() => onSelect(i)} accessibilityLabel={`${d.label} ${formatMoney(d.value * 1000)}`} />
          ))}
        </Row>
      )}
    </View>
  );
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
}

export const SLICE_COLORS = ['#5AB8FF', '#B65CF4', '#FF9A6A', '#3FE0B4', '#FFC94D', '#FF6B8B', '#7C8CFF', '#8DE36B', '#C3A6FF', '#A0AEC0'];

export function DonutChart({ data, size = 200, centerLabel, centerValue }: { data: { value: number; color: string }[]; size?: number; centerLabel?: string; centerValue?: string }) {
  const { colors } = useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  const stroke = size * 0.13;
  const r = (size - stroke) / 2;
  const c = size / 2;
  let angle = -Math.PI / 2;
  const gap = data.length > 1 ? 0.025 : 0;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={r} stroke={colors.sunken} strokeWidth={stroke} fill="none" />
        {total > 0 &&
          data.map((d, i) => {
            const sweep = (d.value / total) * Math.PI * 2;
            const a0 = angle + gap / 2;
            const a1 = angle + Math.max(sweep - gap / 2, gap / 2 + 0.001);
            angle += sweep;
            if (sweep >= Math.PI * 2 - 0.001) return <Circle key={i} cx={c} cy={c} r={r} stroke={d.color} strokeWidth={stroke} fill="none" />;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const p = `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
            return <Path key={i} d={p} stroke={d.color} strokeWidth={stroke} fill="none" strokeLinecap="butt" />;
          })}
      </Svg>
      {!!centerLabel && (
        <Txt variant="caption" tone="muted">
          {centerLabel}
        </Txt>
      )}
      {!!centerValue && <Txt variant="h2">{centerValue}</Txt>}
    </View>
  );
}

/** Smooth curve through points (monotone-ish cubic). */
function smoothPath(pts: readonly (readonly [number, number])[]) {
  return pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `${acc} C ${mx} ${py} ${mx} ${y} ${x} ${y}`;
  }, '');
}

/** SVG ids must be unique per page (several charts can share a screen on the web). */
const useSvgId = (name: string) => `${name}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * Smooth area/line chart. Values in milliunits. `compare` draws a dashed second series on the same scale
 * (e.g. last month); `slots` spreads points over a fixed number of positions (e.g. days of the month)
 * so a partial series stops where it is. Tapping selects the nearest point.
 */
export function LineChart({
  data,
  height = 200,
  color,
  compare,
  slots,
  selected,
  onSelect,
  axis,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  compare?: number[];
  slots?: number;
  selected?: number;
  onSelect?: (i: number) => void;
  /** Show compact amounts on the left */
  axis?: boolean;
}) {
  const { colors } = useTheme();
  const { w, onLayout } = useWidth();
  const areaId = useSvgId('area');
  const lineId = useSvgId('line');
  const left = axis ? 44 : 14;
  const pad = 14;
  const chartH = height - 28;
  const all = [...data.map((d) => d.value), ...(compare ?? [])];
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const top = axis ? niceMax(max) : max;
  const range = top - min || 1;
  const n = Math.max(slots ?? data.length, compare?.length ?? 0, 1);
  const step = n > 1 ? (w - left - pad) / (n - 1) : 0;
  const y = (v: number) => 8 + (chartH - 8) * (1 - (v - min) / range);
  const pts = data.map((d, i) => [left + i * step, y(d.value)] as const);
  const comparePts = (compare ?? []).map((v, i) => [left + i * step, y(v)] as const);
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L ${pts[pts.length - 1][0]} ${y(Math.max(min, 0))} L ${pts[0][0]} ${y(Math.max(min, 0))} Z` : '';
  const zeroY = y(0);
  const stroke = color ?? GRADIENT[1];
  const labelEvery = Math.ceil(n / 6);
  const sel = selected !== undefined && selected < pts.length ? selected : undefined;

  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GRADIENT[0]} />
            <Stop offset="0.5" stopColor={GRADIENT[1]} />
            <Stop offset="1" stopColor={GRADIENT[2]} />
          </LinearGradient>
        </Defs>
        {axis &&
          [0.25, 0.5, 0.75, 1].map((t) => (
            <G key={t}>
              <Line x1={left} x2={w - pad} y1={y(top * t)} y2={y(top * t)} stroke={colors.border} strokeDasharray="3 5" />
              <SvgText x={0} y={y(top * t) + 4} fontSize={10} fill={colors.muted} fontFamily={FONT.medium}>
                {formatMoney(top * t, { compact: true }).replace(/\.00$/, '')}
              </SvgText>
            </G>
          ))}
        {min < 0 && <Line x1={left} x2={w - pad} y1={zeroY} y2={zeroY} stroke={colors.border} strokeDasharray="4 4" />}
        {comparePts.length > 1 && <Path d={smoothPath(comparePts)} stroke={colors.muted} strokeWidth={2} strokeDasharray="5 5" fill="none" opacity={0.7} />}
        {pts.length > 1 && <Path d={area} fill={`url(#${areaId})`} />}
        {pts.length > 1 && <Path d={line} stroke={color ?? `url(#${lineId})`} strokeWidth={3} fill="none" strokeLinecap="round" />}
        {sel !== undefined && <Line x1={pts[sel][0]} x2={pts[sel][0]} y1={8} y2={chartH} stroke={colors.border} strokeWidth={1.5} />}
        {pts.map(([x, py], i) => (
          <Circle key={i} cx={x} cy={py} r={i === (sel ?? pts.length - 1) ? 5 : 0} fill={colors.surface} stroke={GRADIENT[2]} strokeWidth={3} />
        ))}
        {Array.from({ length: n }, (_, i) => i).map((i) =>
          (i % labelEvery === 0 || i === n - 1) && (data[i] || slots) ? (
            <SvgText key={i} x={left + i * step} y={height - 6} fontSize={10} fill={colors.muted} textAnchor="middle" fontFamily={FONT.medium}>
              {data[i]?.label ?? String(i + 1)}
            </SvgText>
          ) : null,
        )}
      </Svg>
      {onSelect && pts.length > 0 && (
        <Row style={{ position: 'absolute', left: left - step / 2, width: step * n, top: 0, bottom: 0 }}>
          {Array.from({ length: n }, (_, i) => (
            <Tap key={i} style={{ flex: 1, height: '100%' }} onPress={() => onSelect(Math.min(i, pts.length - 1))} accessibilityLabel={data[i] ? `${data[i].label} ${formatMoney(data[i].value)}` : undefined} />
          ))}
        </Row>
      )}
    </View>
  );
}

/** Net worth over time: assets as a band above zero, debts below it, and the net worth line on top. */
export function NetWorthChart({
  data,
  height = 200,
  selected,
  onSelect,
}: {
  data: { label: string; assets: number; debts: number; net: number }[];
  height?: number;
  selected?: number;
  onSelect?: (i: number) => void;
}) {
  const { colors } = useTheme();
  const { w, onLayout } = useWidth();
  const lineId = useSvgId('nw');
  const left = 44;
  const pad = 14;
  const chartH = height - 28;
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.assets, d.net))));
  const minRaw = Math.min(0, ...data.map((d) => Math.min(-d.debts, d.net)));
  const min = minRaw < 0 ? -niceMax(-minRaw) : 0;
  const range = max - min || 1;
  const n = Math.max(data.length, 1);
  const step = n > 1 ? (w - left - pad) / (n - 1) : 0;
  const y = (v: number) => 8 + (chartH - 8) * (1 - (v - min) / range);
  const x = (i: number) => left + i * step;
  const band = (vals: number[]) => {
    if (vals.length < 2) return '';
    const top = smoothPath(vals.map((v, i) => [x(i), y(v)] as const));
    return `${top} L ${x(vals.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  };
  const netPts = data.map((d, i) => [x(i), y(d.net)] as const);
  const labelEvery = Math.ceil(n / 6);
  const sel = selected !== undefined && selected < n ? selected : undefined;

  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GRADIENT[0]} />
            <Stop offset="0.5" stopColor={GRADIENT[1]} />
            <Stop offset="1" stopColor={GRADIENT[2]} />
          </LinearGradient>
        </Defs>
        {[max, max / 2, 0, ...(min < 0 ? [min] : [])].map((v) => (
          <G key={v}>
            <Line x1={left} x2={w - pad} y1={y(v)} y2={y(v)} stroke={colors.border} strokeDasharray={v === 0 ? undefined : '3 5'} />
            <SvgText x={0} y={y(v) + 4} fontSize={10} fill={colors.muted} fontFamily={FONT.medium}>
              {formatMoney(v, { compact: true }).replace(/\.00$/, '')}
            </SvgText>
          </G>
        ))}
        <Path d={band(data.map((d) => d.assets))} fill={colors.positive} opacity={0.18} />
        <Path d={band(data.map((d) => -d.debts))} fill={colors.danger} opacity={0.18} />
        {netPts.length > 1 && <Path d={smoothPath(netPts)} stroke={`url(#${lineId})`} strokeWidth={3} fill="none" strokeLinecap="round" />}
        {sel !== undefined && <Line x1={x(sel)} x2={x(sel)} y1={8} y2={chartH} stroke={colors.border} strokeWidth={1.5} />}
        {netPts.map(([px, py], i) => (
          <Circle key={i} cx={px} cy={py} r={i === (sel ?? n - 1) ? 5 : 0} fill={colors.surface} stroke={GRADIENT[2]} strokeWidth={3} />
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <SvgText key={i} x={x(i)} y={height - 6} fontSize={10} fill={colors.muted} textAnchor="middle" fontFamily={FONT.medium}>
              {d.label}
            </SvgText>
          ) : null,
        )}
      </Svg>
      {onSelect && n > 1 && (
        <Row style={{ position: 'absolute', left: left - step / 2, width: step * n, top: 0, bottom: 0 }}>
          {data.map((d, i) => (
            <Tap key={i} style={{ flex: 1, height: '100%' }} onPress={() => onSelect(i)} accessibilityLabel={`${d.label} ${formatMoney(d.net)}`} />
          ))}
        </Row>
      )}
    </View>
  );
}

/** Circular progress ring with a gradient stroke. */
export function ProgressRing({ progress, size = 160, stroke = 14, children }: { progress: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const ringId = useSvgId('ring');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={GRADIENT[0]} />
            <Stop offset="0.5" stopColor={GRADIENT[1]} />
            <Stop offset="1" stopColor={GRADIENT[2]} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.sunken} strokeWidth={stroke} fill="none" />
        {p > 0 && <Circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${ringId})`} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />}
      </Svg>
      {children}
    </View>
  );
}

/** Horizontal stacked bar used on the Reflect spending card. */
export function StackedBar({ data, height = 30 }: { data: { value: number; color: string }[]; height?: number }) {
  const { colors } = useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Row style={{ height, borderRadius: height / 3, overflow: 'hidden', backgroundColor: colors.sunken, gap: 2, alignItems: 'stretch' }}>
      {total > 0 && data.map((d, i) => <View key={i} style={{ flex: d.value / total, backgroundColor: d.color }} />)}
    </Row>
  );
}

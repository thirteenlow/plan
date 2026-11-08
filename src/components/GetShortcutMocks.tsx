import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { Phone, T, Taps, usePhase, W } from './ShortcutMocks';

/*
 * Drawn iPhone screens for the one-tap setup (GetShortcut): adding a ready-made shortcut from its iCloud link,
 * answering its questions, and turning its automation on. Dark, like the Shortcuts app.
 * Tap points are in screen coordinates below the status bar (W × 400).
 */

const D = { card: '#1C1C1E', card2: '#2C2C2E', line: '#38383A', text: '#FFFFFF', soft: '#8E8E93', blue: '#0A84FF', green: '#30D158' };
type Icon = React.ComponentProps<typeof Ionicons>['name'];

const Caption = ({ children }: { children: React.ReactNode }) => (
  <T size={9} color={D.soft} style={{ position: 'absolute', left: 0, right: 0, bottom: 16, textAlign: 'center' }}>
    {children}
  </T>
);

const Tile = ({ size = 56, icon = 'layers' }: { size?: number; icon?: Icon }) => (
  <View style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: '#5E5CE6', alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={icon} size={size * 0.5} color="#fff" />
  </View>
);

const BlueButton = ({ label, dim }: { label: string; dim?: boolean }) => (
  <View style={{ height: 34, borderRadius: 17, backgroundColor: dim ? D.card2 : D.blue, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16 }}>
    <T size={11} weight="semibold" color={dim ? D.soft : '#fff'}>
      {label}
    </T>
  </View>
);

/** Step 1: the iCloud link opens the shortcut's page; Add Shortcut. */
export function AddShortcutScreen({ name }: { name: string }) {
  const phase = usePhase(2, 1900);
  return (
    <Phone dark>
      <View style={{ height: 22, marginHorizontal: 14, marginTop: 2, borderRadius: 8, backgroundColor: D.card, justifyContent: 'center', paddingHorizontal: 8 }}>
        <T size={8.5} color={D.soft}>
          icloud.com/shortcuts
        </T>
      </View>
      <View style={{ alignItems: 'center', marginTop: 46, gap: 10 }}>
        <Tile size={70} />
        <T size={14} weight="bold" color={D.text}>
          {name}
        </T>
        <T size={9.5} color={D.soft}>
          Shortcut · 2 actions
        </T>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 30 + 250 }}>
        <BlueButton label={phase ? 'Opening Shortcuts…' : 'Add Shortcut'} dim={!!phase} />
      </View>
      <Caption>{phase ? 'Shortcuts opens and asks one question' : 'Tap Add Shortcut'}</Caption>
      {!phase && <Taps points={[{ x: W / 2, y: 250 + 17 }]} />}
    </Phone>
  );
}

/** Step 2: the shortcut's question. Paste the key (and type the app's or source's name for the general ones). */
export function QuestionsScreen({ name, ask }: { name: string; ask?: { question: string; answer: string } }) {
  // Key: empty, Paste bubble, pasted, Next; then (general) the name typed, Add Shortcut.
  const steps = ask ? 6 : 4;
  const phase = usePhase(steps, 1600);
  const second = !!ask && phase >= 4;
  const pasted = phase >= 2;
  const field = second ? (phase >= 4 ? ask.answer : '') : pasted ? '••••••••••••••••' : '';
  const lastStep = phase === steps - 1;
  return (
    <Phone dark>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, height: 28 }}>
        <T size={10} color={D.blue}>
          Cancel
        </T>
        <T size={10.5} weight="semibold" color={D.text}>
          Set Up Shortcut
        </T>
        <View style={{ width: 30 }} />
      </View>
      <View style={{ alignItems: 'center', marginTop: 18, gap: 8 }}>
        <Tile size={44} />
        <T size={11} weight="semibold" color={D.text}>
          {name}
        </T>
      </View>
      <View style={{ marginHorizontal: 16, marginTop: 22, gap: 8 }}>
        <T size={9.5} color={D.soft} style={{ textAlign: 'center' }}>
          {second ? ask.question : 'Paste your Plan key. Plan copied it for you.'}
        </T>
        <View style={{ height: 32, borderRadius: 9, backgroundColor: D.card, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: phase % 2 === 0 && !field ? D.blue : D.card }}>
          <T size={10} color={field ? D.text : D.soft}>
            {field || 'Text'}
          </T>
        </View>
        {phase === 1 && !second && (
          <View style={{ alignSelf: 'flex-start', marginTop: -2, backgroundColor: D.card2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <T size={9.5} weight="semibold" color={D.text}>
              Paste
            </T>
          </View>
        )}
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 30 + 300 }}>
        <BlueButton label={ask && !second ? 'Next' : 'Add Shortcut'} dim={!field} />
      </View>
      <Caption>
        {second
          ? lastStep
            ? 'Tap Add Shortcut'
            : `Type ${ask.answer}`
          : ['Tap the box', 'Tap Paste', 'Your key is in', ask ? 'Tap Next' : 'Tap Add Shortcut'][phase]}
      </Caption>
      {phase === 0 && <Taps points={[{ x: W / 2, y: 28 + 18 + 44 + 8 + 14 + 22 + 30 }]} />}
      {phase === 1 && !second && <Taps points={[{ x: 40, y: 28 + 18 + 44 + 8 + 14 + 22 + 62 }]} />}
      {(phase === 3 || (ask && lastStep)) && <Taps points={[{ x: W / 2, y: 300 + 17 }]} />}
    </Phone>
  );
}

const Toggle = ({ on }: { on: boolean }) => (
  <View style={{ width: 30, height: 18, borderRadius: 9, backgroundColor: on ? D.green : '#48484A', padding: 2, alignItems: on ? 'flex-end' : 'flex-start' }}>
    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' }} />
  </View>
);

/**
 * Step 3: open the shortcut and turn Automation on (iPhone adds it off). `change`: for the general shortcuts, the
 * app or sender to swap in first; `rename`: the name to give it.
 */
export function TurnOnScreen({ name, trigger, change, rename }: { name: string; trigger: { icon: Icon; text: string; value: string }; change?: string; rename?: string }) {
  const phases = [...(change ? ['change'] : []), 'toggle', 'on', ...(rename ? ['rename'] : [])];
  const phase = phases[usePhase(phases.length, 1900)];
  const on = phase === 'on' || phase === 'rename';
  const value = change && phase !== 'change' ? change : trigger.value;
  return (
    <Phone dark>
      <View style={{ height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <Tile size={14} />
        <T size={10.5} weight="semibold" color={D.text}>
          {phase === 'rename' && rename ? rename : name}
        </T>
        <Ionicons name="chevron-down-circle" size={10} color={D.soft} />
      </View>
      <View style={{ marginHorizontal: 10, marginTop: 6, borderRadius: 12, backgroundColor: D.card, padding: 9, gap: 7 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <Ionicons name={trigger.icon} size={11} color="#FF453A" />
          <T size={10} weight="semibold" color={D.text}>
            {trigger.text}
          </T>
          <View style={{ backgroundColor: `${D.blue}33`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
            <T size={9} weight="semibold" color={D.blue}>
              {value}
            </T>
          </View>
        </View>
        {[
          ['Automation', on],
          ['Notify', false],
        ].map(([label, v]) => (
          <View key={label as string} style={{ height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: D.line }}>
            <T size={9.5} color={D.text}>
              {label}
            </T>
            <Toggle on={v as boolean} />
          </View>
        ))}
      </View>
      <View style={{ marginHorizontal: 10, marginTop: 10, borderRadius: 12, backgroundColor: D.card, padding: 9, gap: 6, opacity: 0.6 }}>
        <T size={9.5} weight="semibold" color={D.text}>
          Get contents of URL
        </T>
        <T size={8.5} color={D.soft}>
          token · amount · merchant
        </T>
      </View>
      <Caption>
        {phase === 'change' ? `Tap ${trigger.value}, pick ${change}` : phase === 'toggle' ? 'Turn Automation on' : phase === 'on' ? 'Leave Notify off. Done!' : `Rename it “${rename}”`}
      </Caption>
      {phase === 'change' && <Taps points={[{ x: 150, y: 34 + 6 + 15 }]} />}
      {phase === 'toggle' && <Taps points={[{ x: W - 34, y: 34 + 6 + 9 + 18 + 7 + 13 }]} />}
      {phase === 'rename' && <Taps points={[{ x: W / 2, y: 17 }]} />}
    </Phone>
  );
}

/** Step 4: pay as usual; Plan logs it for review. */
export function LoggedScreen({ what }: { what: string }) {
  const phase = usePhase(2, 2000);
  return (
    <Phone dark>
      <View style={{ alignItems: 'center', marginTop: 70, gap: 8 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: D.green, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={30} color="#fff" />
        </View>
        <T size={11} color={D.soft}>
          {what}
        </T>
        <T size={22} weight="bold" color={D.text}>
          S$4.50
        </T>
      </View>
      {phase === 1 && (
        <View style={{ position: 'absolute', left: 10, right: 10, top: 34, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(44,44,46,0.97)', borderRadius: 14, padding: 9 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#9A5CF5', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="wallet" size={12} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <T size={9.5} weight="semibold" color={D.text}>
              Plan
            </T>
            <T size={8.5} color={D.soft}>
              Logged S$4.50 at Kopi Corner. Review in Spending.
            </T>
          </View>
        </View>
      )}
      <Caption>{phase ? 'It’s in Spending to review' : 'Pay as usual'}</Caption>
    </Phone>
  );
}

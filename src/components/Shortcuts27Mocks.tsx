import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Phone, T, Taps, usePhase, W } from './ShortcutMocks';

/*
 * Drawn iPhone screens for the iOS 27 Shortcuts app, where an automation is a shortcut whose first block is a
 * trigger: + › Edit (skips the "Describe a shortcut" prompt) › Automation › pick the trigger › add actions.
 * `kind` picks the trigger: Wallet (Apple Pay auto-log) or Notification (SimplyGo fares).
 * Tap points are in screen coordinates below the status bar (W × 400).
 */

const D = { bg: '#000000', card: '#1C1C1E', card2: '#2C2C2E', line: '#38383A', text: '#FFFFFF', soft: '#8E8E93', blue: '#0A84FF', green: '#30D158', purple: '#5E5CE6' };
type Icon = React.ComponentProps<typeof Ionicons>['name'];
export type Kind = 'wallet' | 'notify';

const Pill = ({ label, color = D.blue, icon }: { label: string; color?: string; icon?: Icon }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${color}33`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
    {icon && <Ionicons name={icon} size={8} color={color} />}
    <T size={8.5} weight="semibold" color={color}>
      {label}
    </T>
  </View>
);

/** Back button, title and right button, as in the editor's header. */
function Header({ title, right = 'flower-outline', rightText }: { title: string; right?: Icon | null; rightText?: string }) {
  return (
    <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: D.card, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={14} color={D.text} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: '#32ADE6', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="layers" size={9} color="#fff" />
        </View>
        <T size={10.5} weight="semibold" color={D.text}>
          {title}
        </T>
        <Ionicons name="chevron-down-circle" size={10} color={D.soft} />
      </View>
      {rightText ? (
        <View style={{ height: 26, borderRadius: 13, backgroundColor: D.card, paddingHorizontal: 10, justifyContent: 'center' }}>
          <T size={9.5} color={D.text}>
            {rightText}
          </T>
        </View>
      ) : (
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: right ? D.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {right && <Ionicons name={right} size={14} color={D.text} />}
        </View>
      )}
    </View>
  );
}

/** The trigger block at the top of the shortcut, filled in. */
function TriggerBlock({ kind, app, filter = '$' }: { kind: Kind; app: string; filter?: string }) {
  return (
    <View style={{ marginHorizontal: 10, marginTop: 4, borderRadius: 12, backgroundColor: D.card, padding: 8, gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
        <Ionicons name={kind === 'wallet' ? 'wallet' : 'notifications'} size={10} color={D.soft} />
        <T size={9.5} weight="semibold" color={D.text}>
          {kind === 'wallet' ? 'When I tap any of' : 'When I receive a notification from'}
        </T>
        <Pill label={kind === 'wallet' ? '2 cards' : app} />
      </View>
      {kind === 'notify' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pill label="Message" />
          <T size={9} color={D.text}>
            contains
          </T>
          <Pill label={filter} color={D.text} />
        </View>
      )}
    </View>
  );
}

// ---------- Screens ----------

/** 1: All Shortcuts, tap the + at the bottom. */
function LibraryScreen({ kind }: { kind: Kind }) {
  const tiles: [string, string, Icon][] = [
    ['Scan Payment', '#E86ED0', 'logo-usd'],
    ['Daily Declutter', '#E5C100', 'images'],
    [kind === 'wallet' ? 'Morning Routine' : 'Apple Pay Auto-log', kind === 'wallet' ? '#5E8BE0' : '#30B05A', 'layers'],
    ['Wallet', '#B8A07E', 'wallet'],
  ];
  return (
    <Phone dark>
      <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: D.card, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={14} color={D.text} />
        </View>
        <View style={{ backgroundColor: D.card, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 5 }}>
          <T size={9.5} color={D.text}>
            Select
          </T>
        </View>
      </View>
      <T size={19} weight="bold" color={D.text} style={{ paddingHorizontal: 12, marginTop: 4, marginBottom: 10 }}>
        All Shortcuts
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 }}>
        {tiles.map(([name, color, icon]) => (
          <View key={name} style={{ width: (W - 32) / 2, height: 62, borderRadius: 14, backgroundColor: color, padding: 8, justifyContent: 'space-between' }}>
            <Ionicons name={icon} size={15} color="#fff" />
            <T size={9.5} weight="semibold" color="#fff">
              {name}
            </T>
          </View>
        ))}
      </View>
      <View style={{ position: 'absolute', left: W / 2 - 22, top: 30 + 338, width: 44, height: 44, borderRadius: 22, backgroundColor: '#3A3A3C', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="add" size={24} color="#fff" />
      </View>
      <Taps points={[{ x: W / 2, y: 360 }]} />
    </Phone>
  );
}

/** 2: the "Describe a shortcut" prompt, tap Edit to build it yourself. */
function PromptScreen() {
  return (
    <Phone dark>
      <Header title="New Shortcut" rightText="Edit" />
      <View style={{ marginHorizontal: 18, marginTop: 24, height: 120, borderRadius: 26, borderWidth: 1, borderColor: '#1F3A40', backgroundColor: '#07181C', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 }}>
        <T size={11.5} weight="semibold" color={D.text} style={{ textAlign: 'center' }}>
          What do you want
        </T>
        <T size={11.5} weight="semibold" color={D.text} style={{ textAlign: 'center', marginTop: -6 }}>
          your shortcut to do?
        </T>
        <T size={8.5} color={D.soft}>
          “Remind me to read this article later”
        </T>
      </View>
      <View style={{ position: 'absolute', top: 30 + 228, left: 10, right: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1, height: 30, borderRadius: 15, backgroundColor: D.card, justifyContent: 'center', paddingHorizontal: 12 }}>
          <T size={9.5} color={D.soft}>
            Describe a shortcut
          </T>
        </View>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: D.card, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={15} color={D.text} />
        </View>
      </View>
      <View style={{ position: 'absolute', top: 30 + 270, left: 0, right: 0, bottom: 0, backgroundColor: '#1C1C1E', flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8, justifyContent: 'center' }}>
        {'qwertyuiopasdfghjklzxcvbnm'.split('').map((k) => (
          <View key={k} style={{ width: 18, height: 24, borderRadius: 4, backgroundColor: '#3A3A3C' }} />
        ))}
      </View>
      <Taps points={[{ x: W - 30, y: 18 }]} />
    </Phone>
  );
}

/** The bottom sheet with search and the Automation / Scripting / Controls chips. */
function Sheet({ children, top = 196 }: { children: React.ReactNode; top?: number }) {
  return (
    <View style={{ position: 'absolute', left: 4, right: 4, top: 30 + top, bottom: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: D.card, paddingTop: 6 }}>
      <View style={{ alignSelf: 'center', width: 30, height: 3, borderRadius: 2, backgroundColor: '#48484A', marginBottom: 8 }} />
      {children}
    </View>
  );
}

const SearchBar = ({ text }: { text?: string }) => (
  <View style={{ marginHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: D.card2, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
    <Ionicons name="search" size={12} color={D.soft} />
    <T size={10} color={text ? D.text : D.soft}>
      {text || 'Search'}
    </T>
  </View>
);

const SheetRow = ({ icon, color, title }: { icon: Icon; color: string; title: string }) => (
  <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
    <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={11} color="#fff" />
    </View>
    <T size={10} color={D.text}>
      {title}
    </T>
  </View>
);

/** 3: tap Automation, then the trigger. */
function AutomationScreen({ kind }: { kind: Kind }) {
  const phase = usePhase(2, 2000);
  const triggers: [string, Icon, string][] = [
    ['Time of Day', 'time', '#FF9500'],
    ['Wallet', 'wallet', '#3A3A3C'],
    ['Notification', 'notifications', '#FF3B30'],
    ['App', 'apps', '#8E8E93'],
    ['Message', 'chatbubble', '#30D158'],
  ];
  const pick = kind === 'wallet' ? 1 : 2;
  return (
    <Phone dark>
      <Header title="New Shortcut" />
      <T size={10} color={D.soft} style={{ textAlign: 'center', marginTop: 40 }}>
        Add actions from below
      </T>
      <T size={10} color={D.soft} style={{ textAlign: 'center' }}>
        to create a shortcut.
      </T>
      <Sheet top={phase ? 150 : 196}>
        <SearchBar />
        {phase === 0 ? (
          <>
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 10, marginTop: 8 }}>
              {[
                ['Automation', 'alarm-outline'],
                ['Scripting', 'code-slash'],
                ['Controls', 'toggle'],
              ].map(([l, ic]) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: D.card2, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 5 }}>
                  <Ionicons name={ic as Icon} size={9} color={D.blue} />
                  <T size={8.5} color={D.blue}>
                    {l}
                  </T>
                </View>
              ))}
            </View>
            <View style={{ marginTop: 6 }}>
              <SheetRow icon="chatbubble" color="#30D158" title="Send Message" />
              <SheetRow icon="arrow-up-outline" color="#5E5CE6" title="Open App" />
              <SheetRow icon="musical-note" color="#FF2D55" title="Play Music" />
            </View>
          </>
        ) : (
          <View style={{ marginTop: 6 }}>
            <T size={9} color={D.soft} style={{ paddingHorizontal: 14, marginBottom: 2 }}>
              AUTOMATION
            </T>
            {triggers.map(([t, ic, c]) => (
              <SheetRow key={t} icon={ic} color={c} title={t} />
            ))}
          </View>
        )}
      </Sheet>
      <Taps key={phase} points={[phase === 0 ? { x: 48, y: 196 + 11 + 28 + 8 + 11 } : { x: 70, y: 150 + 11 + 28 + 6 + 14 + pick * 28 + 14 }]} />
    </Phone>
  );
}

/** 4: set up the trigger (cards, or the app plus "Message contains"). */
function TriggerScreen({ kind, app }: { kind: Kind; app: string }) {
  const notify = kind === 'notify';
  // Wallet: tap Cards, tick them, done. Notification: pick the app, Add Filter, Title → Message, type $.
  const phase = usePhase(notify ? 6 : 3, 1800);
  const picked = phase >= 1;
  const toggles = (
    <View style={{ marginHorizontal: 10, marginTop: 8, borderRadius: 12, backgroundColor: D.card }}>
      {[
        ['Run Immediately', true],
        ['Notify When Run', false],
      ].map(([l, on], i) => (
        <View key={l as string} style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderTopWidth: i ? 1 : 0, borderTopColor: D.line }}>
          <T size={9.5} color={D.text}>
            {l as string}
          </T>
          <View style={{ width: 30, height: 18, borderRadius: 9, backgroundColor: on ? D.green : '#48484A', padding: 2, alignItems: on ? 'flex-end' : 'flex-start' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' }} />
          </View>
        </View>
      ))}
    </View>
  );
  const choices = notify ? ['Grab', 'Instagram', app, 'WhatsApp'] : ['Visa •••• 4821', 'Mastercard •••• 1093', 'EZ-Link'];
  const field = phase >= 5 ? 'Message' : 'Title';
  const captions = notify
    ? [`Tap App`, `Pick ${app}`, 'Tap Add Filter', 'Tap Title', 'Change it to Message', 'Type $ in the box']
    : ['Tap Cards', 'Tick your cards', 'Leave Run Immediately on'];
  const taps = notify
    ? [{ x: 40, y: 91 }, { x: W / 2, y: 120 + 4 + 2 * 26 + 13 }, { x: 60, y: 112 }, { x: 34, y: 112 }, { x: 70, y: 122 + 4 + 2 * 22 + 11 }, { x: 150, y: 112 }]
    : [{ x: 150, y: 50 }, { x: W / 2, y: 120 + 4 + 13 }, { x: 120, y: 50 + 34 }];
  return (
    <Phone dark>
      <Header title="New Shortcut" />
      {notify && (
        <View style={{ height: 22, marginHorizontal: 10, marginBottom: 4, borderRadius: 10, backgroundColor: phase === 3 || phase === 4 ? D.card2 : 'transparent', paddingHorizontal: 8, justifyContent: 'center' }}>
          {(phase === 3 || phase === 4) && (
            <T size={8.5} color={D.text}>
              Configure “Title” to enable this.
            </T>
          )}
        </View>
      )}
      <View style={{ marginHorizontal: 10, borderRadius: 12, backgroundColor: D.card, padding: 8, gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <Ionicons name={notify ? 'notifications' : 'wallet'} size={10} color={D.soft} />
          <T size={9.5} weight="semibold" color={D.text}>
            {notify ? 'When I receive a notification from' : 'When I tap any of'}
          </T>
          <Pill label={notify ? (picked ? app : 'App') : picked ? '2 cards' : 'Cards'} />
        </View>
        {notify && phase === 2 && (
          <View style={{ height: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="add-circle" size={11} color={D.blue} />
            <T size={9} color={D.blue}>
              Add Filter
            </T>
          </View>
        )}
        {notify && phase >= 3 && (
          <View style={{ height: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pill label={field} />
            <T size={9} color={D.text}>
              contains
            </T>
            <Pill label={phase >= 5 ? '$' : ' '} color={D.text} />
          </View>
        )}
      </View>
      {toggles}
      {phase === 1 && (
        <View style={{ position: 'absolute', left: 20, right: 20, top: 30 + 120, borderRadius: 14, backgroundColor: D.card2, paddingVertical: 4 }}>
          {choices.map((c) => {
            const on = notify ? c === app : c !== 'EZ-Link';
            return (
              <View key={c} style={{ height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
                <T size={9.5} color={D.text}>
                  {c}
                </T>
                {on && <Ionicons name="checkmark" size={12} color={D.blue} />}
              </View>
            );
          })}
        </View>
      )}
      {notify && phase === 4 && (
        <View style={{ position: 'absolute', left: 14, width: 120, top: 30 + 122, borderRadius: 14, backgroundColor: D.card2, paddingVertical: 4 }}>
          {['Title', 'Subtitle', 'Message'].map((o) => (
            <View key={o} style={{ height: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
              <View style={{ width: 10 }}>{o === 'Title' && <Ionicons name="checkmark" size={10} color={D.text} />}</View>
              <T size={9.5} color={D.text}>
                {o}
              </T>
            </View>
          ))}
        </View>
      )}
      <T size={9} color={D.soft} style={{ position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center' }}>
        {captions[phase]}
      </T>
      <Taps key={phase} points={[taps[phase]]} />
    </Phone>
  );
}

/** 5: search for Get Contents of URL in the bottom sheet. */
function ActionScreen({ kind, app }: { kind: Kind; app: string }) {
  const [typed, setTyped] = useState(0);
  const q = 'Get Contents of URL';
  useEffect(() => {
    const t = setTimeout(() => setTyped((n) => (n >= q.length + 14 ? 0 : n + 1)), typed === 0 ? 700 : 90);
    return () => clearTimeout(t);
  }, [typed]);
  const done = typed >= q.length;
  return (
    <Phone dark>
      <Header title="New Shortcut" />
      <TriggerBlock kind={kind} app={app} />
      <Sheet top={176}>
        <SearchBar text={q.slice(0, Math.min(typed, q.length))} />
        <View style={{ marginTop: 6, opacity: done ? 1 : 0.25 }}>
          <SheetRow icon="globe" color="#30D158" title="Get Contents of URL" />
          <SheetRow icon="link" color="#30D158" title="URL" />
        </View>
      </Sheet>
      {done && <Taps points={[{ x: 90, y: 176 + 11 + 28 + 6 + 14 }]} />}
    </Phone>
  );
}

/** The "Get contents of URL" action card; `rows` appear below it once expanded. */
function UrlCard({ filled, expanded, rows }: { filled: boolean; expanded: boolean; rows?: React.ReactNode }) {
  return (
    <View style={{ marginHorizontal: 10, marginTop: 8, borderRadius: 12, backgroundColor: D.card, overflow: 'hidden' }}>
      <View style={{ height: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}>
        <Ionicons name="globe" size={12} color={D.green} />
        <T size={9.5} color={D.text}>
          Get contents of
        </T>
        <View style={{ flex: 1 }}>
          <Pill label={filled ? 'https://…supabase.co/…' : 'URL'} />
        </View>
        <Ionicons name={expanded ? 'chevron-up-circle-outline' : 'chevron-down-circle-outline'} size={14} color={D.blue} />
      </View>
      {expanded && rows}
    </View>
  );
}

const Line = ({ label, value, on }: { label: string; value: React.ReactNode; on?: boolean }) => (
  <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: D.line }}>
    <T size={9.5} color={D.text}>
      {label}
    </T>
    {typeof value === 'string' ? (
      <T size={9.5} color={on ? D.blue : D.soft} weight={on ? 'semibold' : 'medium'}>
        {value}
      </T>
    ) : (
      value
    )}
  </View>
);

/** 6: paste the link, expand, POST, JSON. */
function LinkScreen({ kind, app }: { kind: Kind; app: string }) {
  const phase = usePhase(4);
  const top = 36 + (kind === 'notify' ? 58 : 36) + 8;
  return (
    <Phone dark>
      <Header title="New Shortcut" />
      <TriggerBlock kind={kind} app={app} />
      <UrlCard
        filled={phase >= 1}
        expanded={phase >= 2}
        rows={
          <>
            <Line label="Method" value={phase >= 2 ? 'POST' : 'GET'} on={phase === 2} />
            <Line label="Headers" value="›" />
            <Line label="Request Body" value={phase >= 3 ? 'JSON' : 'None'} on={phase === 3} />
          </>
        }
      />
      <T size={9} color={D.soft} style={{ textAlign: 'center', marginTop: 12 }}>
        {['Tap URL, paste the link', 'Tap the arrow', 'Method → POST', 'Request Body → JSON'][phase]}
      </T>
      <Taps key={phase} points={[[{ x: 140, y: top + 17 }, { x: W - 26, y: top + 17 }, { x: W - 40, y: top + 34 + 14 }, { x: W - 40, y: top + 34 + 2 * 28 + 14 }][phase]]} />
    </Phone>
  );
}

/** 7: the four fields; values come from the trigger's variable (Notification › Body, or Wallet's details). */
function FieldsScreen({ kind, app }: { kind: Kind; app: string }) {
  const phase = usePhase(6, 1600);
  const source = kind === 'wallet' ? 'Shortcut Input' : 'Notification';
  const v = (detail: string) => <Pill label={`${source} › ${detail}`} color={D.purple} icon={kind === 'wallet' ? 'wallet' : 'notifications'} />;
  const fields: [string, React.ReactNode][] = [
    ['token', <T key="t" size={8.5} color={D.soft}>Xk29…</T>],
    ['amount', phase === 1 ? <Pill key="a" label={source} color={D.purple} /> : v(kind === 'wallet' ? 'Amount' : 'Body')],
    ['merchant', kind === 'wallet' ? v('Merchant') : <T key="m" size={8.5} color={D.text}>{app}</T>],
    ['card', v(kind === 'wallet' ? 'Name' : 'Body')],
  ];
  const shown = fields.slice(0, phase <= 2 ? 2 : Math.min(4, phase));
  return (
    <Phone dark>
      <Header title="New Shortcut" />
      <UrlCard
        filled
        expanded
        rows={
          <>
            <Line label="Request Body" value="JSON" />
            {shown.map(([k, val]) => (
              <View key={k} style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: D.line }}>
                <Ionicons name="remove-circle" size={11} color="#FF453A" />
                <T size={9} color={D.text} style={{ width: 46 }}>
                  {k}
                </T>
                <View style={{ flex: 1, alignItems: 'flex-start' }}>{val}</View>
              </View>
            ))}
            <View style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: D.line }}>
              <Ionicons name="add-circle" size={11} color={D.green} />
              <T size={9} color={D.text}>
                Add new field
              </T>
            </View>
          </>
        }
      />
      {phase === 1 && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, backgroundColor: D.card }}>
          {/* The bar above the keyboard: scroll past Select Variable to the trigger's variables. */}
          <View style={{ position: 'absolute', top: -34, left: 8, right: 8, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={{ flex: 1, height: 28, borderRadius: 14, backgroundColor: D.card2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="layers-outline" size={10} color={D.text} />
                <T size={9} color={D.text}>
                  Shortcut Input
                </T>
              </View>
              {kind === 'notify' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="notifications-outline" size={10} color={D.text} />
                  <T size={9} color={D.text}>
                    Notification
                  </T>
                </View>
              )}
            </View>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: D.card2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={13} color={D.text} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8, justifyContent: 'center' }}>
            {'qwertyuiopasdfghjkl'.split('').map((k) => (
              <View key={k} style={{ width: 18, height: 22, borderRadius: 4, backgroundColor: '#3A3A3C' }} />
            ))}
          </View>
        </View>
      )}
      {phase === 2 && (
        <View style={{ position: 'absolute', left: 30, right: 30, top: 30 + 150, borderRadius: 12, backgroundColor: D.card2, paddingVertical: 4 }}>
          {(kind === 'wallet' ? ['Card or Pass', 'Merchant', 'Amount', 'Name'] : ['Title', 'Subtitle', 'Body', 'App']).map((o) => {
            const pick = o === (kind === 'wallet' ? 'Amount' : 'Body');
            return (
              <T key={o} size={9.5} color={pick ? D.blue : D.text} weight={pick ? 'semibold' : 'medium'} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
                {o}
              </T>
            );
          })}
        </View>
      )}
      <T size={9} color={D.soft} style={{ position: 'absolute', left: 0, right: 0, bottom: phase === 1 ? 142 : 18, textAlign: 'center' }}>
        {[
          'token: paste your key',
          kind === 'notify' ? 'amount: tap it, scroll the bar, tap Notification' : 'amount: tap it, then Shortcut Input',
          `Tap it again, pick ${kind === 'wallet' ? 'Amount' : 'Body'}`,
          kind === 'wallet' ? 'merchant: Shortcut Input › Merchant' : `merchant: type ${app}`,
          kind === 'wallet' ? 'card: Shortcut Input › Name' : 'card: Notification › Body again',
          'All four, in lowercase',
        ][phase]}
      </T>
      {phase < 5 && <Taps key={phase} points={[[{ x: 150, y: 36 + 8 + 34 + 28 + 14 }, { x: kind === 'notify' ? 165 : 110, y: 400 - 100 - 34 + 14 }, { x: W / 2, y: 150 + 4 + 2 * 21 + 10 }, { x: 150, y: 36 + 8 + 34 + 3 * 28 + 14 }, { x: 150, y: 36 + 8 + 34 + 4 * 28 + 14 }][phase]]} />}
    </Phone>
  );
}

/** 8: rename it, then tap the top-right button to save. */
function SaveScreen({ kind, app }: { kind: Kind; app: string }) {
  const phase = usePhase(3, 1800);
  const name = kind === 'wallet' ? 'Apple Pay Auto-log' : `${app} Fares`;
  return (
    <Phone dark>
      <Header title={phase >= 2 ? name : 'New Shortcut'} />
      <TriggerBlock kind={kind} app={app} />
      <UrlCard filled expanded={false} />
      {phase === 1 && (
        <View style={{ position: 'absolute', left: 50, right: 50, top: 30 + 34, borderRadius: 12, backgroundColor: D.card2, paddingVertical: 4 }}>
          {['Rename', 'Choose Icon', 'Move', 'Duplicate'].map((o, i) => (
            <T key={o} size={9.5} color={i === 0 ? D.blue : D.text} weight={i === 0 ? 'semibold' : 'medium'} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
              {o}
            </T>
          ))}
        </View>
      )}
      <T size={9} color={D.soft} style={{ textAlign: 'center', marginTop: 14 }}>
        {['Tap the name', `Rename it “${name}”`, 'Tap the top-right button to save'][phase]}
      </T>
      <Taps key={phase} points={[[{ x: W / 2, y: 18 }, { x: W / 2, y: 34 + 4 + 10 }, { x: W - 23, y: 18 }][phase]]} />
    </Phone>
  );
}

/** One per guide step, in order (8 steps). */
export function shortcuts27Mocks(kind: Kind, app = 'SimplyGo'): React.ComponentType[] {
  return [
    () => <LibraryScreen kind={kind} />,
    PromptScreen,
    () => <AutomationScreen kind={kind} />,
    () => <TriggerScreen kind={kind} app={app} />,
    () => <ActionScreen kind={kind} app={app} />,
    () => <LinkScreen kind={kind} app={app} />,
    () => <FieldsScreen kind={kind} app={app} />,
    () => <SaveScreen kind={kind} app={app} />,
  ];
}

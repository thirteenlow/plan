import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { H, Scroller, T, Taps, usePhase, W } from '@/components/ShortcutMocks';
import { FONT } from '@/theme';

/*
 * Drawn Android screens for the Google / Samsung Wallet setup guide, in MacroDroid's layout (sections for
 * Triggers, Actions and Constraints; pickers grouped by category). Same tap marker as the iPhone guide.
 */

const A = { bg: '#F4F5F9', card: '#FFFFFF', text: '#14161A', soft: '#61656E', line: '#E4E6EC', primary: '#2F6FEB', red: '#E5484D', blue: '#3E7BFA', green: '#2FA36B' };
type Icon = React.ComponentProps<typeof Ionicons>['name'];

/** Android phone outline (punch-hole camera, 30px status bar like the iPhone mock, so tap points line up). */
function Droid({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <View style={{ width: W + 12, height: H + 12, borderRadius: 26, padding: 6, backgroundColor: '#202124', alignSelf: 'center' }}>
      <View style={{ flex: 1, borderRadius: 21, overflow: 'hidden', backgroundColor: dark ? '#101114' : A.bg }}>
        <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}>
          <Text style={{ fontSize: 10, fontFamily: FONT.semibold, color: dark ? '#fff' : A.text }}>12:30</Text>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#000' }} />
          <Row style={{ gap: 3 }}>
            <Ionicons name="wifi" size={11} color={dark ? '#fff' : A.text} />
            <Ionicons name="battery-full" size={12} color={dark ? '#fff' : A.text} />
          </Row>
        </View>
        {children}
      </View>
    </View>
  );
}

const Row = ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;

function Bar({ title, back = true, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  return (
    <Row style={{ height: 40, paddingHorizontal: 12, gap: 10, backgroundColor: A.primary }}>
      {back && <Ionicons name="arrow-back" size={14} color="#fff" />}
      <T size={12} weight="semibold" color="#fff" style={{ flex: 1 }}>
        {title}
      </T>
      {right}
    </Row>
  );
}

function Item({ icon, color, title, sub, right, last }: { icon: Icon; color: string; title: string; sub?: string; right?: React.ReactNode; last?: boolean }) {
  return (
    <Row style={{ gap: 9, paddingVertical: 7, paddingHorizontal: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: A.line, backgroundColor: A.card }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={12} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <T size={10.5}>{title}</T>
        {!!sub && (
          <T size={8.5} color={A.soft}>
            {sub}
          </T>
        )}
      </View>
      {right}
    </Row>
  );
}

/** A Material dialog over a dimmed screen. */
function Dialog({ title, children, buttons = ['CANCEL', 'OK'] }: { title: string; children: React.ReactNode; buttons?: string[] }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 30, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 16 }}>
      <View style={{ backgroundColor: A.card, borderRadius: 14, paddingTop: 14, paddingBottom: 8, paddingHorizontal: 14 }}>
        <T size={12} weight="semibold" style={{ marginBottom: 8 }}>
          {title}
        </T>
        {children}
        <Row style={{ justifyContent: 'flex-end', gap: 18, marginTop: 10, paddingRight: 4 }}>
          {buttons.map((b) => (
            <T key={b} size={9.5} weight="semibold" color={A.primary}>
              {b}
            </T>
          ))}
        </Row>
      </View>
    </View>
  );
}

const Radio = ({ label, on }: { label: string; on?: boolean }) => (
  <Row style={{ gap: 8, paddingVertical: 5 }}>
    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={13} color={on ? A.primary : A.soft} />
    <T size={10}>{label}</T>
  </Row>
);

const Check = ({ label, on, icon, color }: { label: string; on?: boolean; icon?: Icon; color?: string }) => (
  <Row style={{ gap: 8, paddingVertical: 5 }}>
    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={13} color={on ? A.primary : A.soft} />
    {icon && (
      <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={9} color="#fff" />
      </View>
    )}
    <T size={10}>{label}</T>
  </Row>
);

/** The macro editor: Triggers, Actions and Constraints, with what's been added so far. */
function Editor({ trigger, action, named }: { trigger?: boolean; action?: boolean; named?: boolean }) {
  const section = (label: string, color: string, filled?: React.ReactNode) => (
    <View style={{ marginHorizontal: 10, marginTop: 8, borderRadius: 10, overflow: 'hidden', backgroundColor: A.card }}>
      <Row style={{ height: 26, paddingHorizontal: 10, backgroundColor: color, justifyContent: 'space-between' }}>
        <T size={10} weight="semibold" color="#fff">
          {label}
        </T>
        <Ionicons name="add-circle" size={15} color="#fff" />
      </Row>
      {filled ?? (
        <T size={8.5} color={A.soft} style={{ padding: 8 }}>
          Tap + to add
        </T>
      )}
    </View>
  );
  return (
    <>
      <Bar title={named ? 'Plan payments' : 'Enter macro name'} right={<Ionicons name="checkmark" size={15} color="#fff" />} />
      {section('Triggers', A.red, trigger && <Item icon="notifications" color={A.red} title="Notification Received" sub="Wallet, Samsung Wallet" last />)}
      {section('Actions', A.blue, action && <Item icon="globe-outline" color={A.blue} title="HTTP Request" sub="POST https://…supabase.co/…" last />)}
      {section('Constraints', A.green)}
    </>
  );
}

// ---------- Screens, one per step ----------

function InstallScreen() {
  const apps: [string, Icon, string][] = [
    ['Play Store', 'logo-google-playstore', '#01875F'],
    ['Wallet', 'wallet', '#1A73E8'],
    ['Camera', 'camera', '#5F6368'],
    ['Photos', 'images', '#EA4335'],
    ['Plan', 'pie-chart', '#9A5CF5'],
    ['MacroDroid', 'git-network', '#2F6FEB'],
    ['Settings', 'settings', '#5F6368'],
    ['Messages', 'chatbubble', '#1A73E8'],
  ];
  return (
    <Droid dark>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 18, rowGap: 18 }}>
        {apps.map(([name, icon, color]) => (
          <View key={name} style={{ width: '25%', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={19} color="#fff" />
            </View>
            <T size={8.5} color="#fff">
              {name}
            </T>
          </View>
        ))}
      </View>
      <Taps points={[{ x: 12 + (W - 24) / 8, y: 18 + 20 }, { x: 12 + (W - 24) * (3 / 8), y: 18 + 62 + 18 + 20 }]} />
    </Droid>
  );
}

function AddMacroScreen() {
  const phase = usePhase(2, 2000);
  return (
    <Droid>
      {phase === 0 ? (
        <>
          <Bar title="MacroDroid" back={false} right={<Ionicons name="ellipsis-vertical" size={13} color="#fff" />} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 }}>
            {(
              [
                ['Add Macro', 'add-circle', A.primary],
                ['Macros', 'list', '#F08A24'],
                ['Templates', 'copy', '#8E5CF5'],
                ['Variables', 'code-slash', A.green],
              ] as [string, Icon, string][]
            ).map(([t, ic, color]) => (
              <View key={t} style={{ width: (W - 28) / 2, height: 70, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Ionicons name={ic} size={20} color="#fff" />
                <T size={10} weight="semibold" color="#fff">
                  {t}
                </T>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Editor />
      )}
      <Taps key={phase} points={[phase === 0 ? { x: 10 + (W - 28) / 4, y: 40 + 10 + 35 } : { x: W - 22, y: 40 + 8 + 13 }]} />
    </Droid>
  );
}

function TriggerScreen() {
  const cats: [string, Icon, string][] = [
    ['Applications', 'apps', '#F08A24'],
    ['Battery/Power', 'battery-half', A.green],
    ['Call/SMS', 'call', '#26A69A'],
    ['Connectivity', 'wifi', A.blue],
    ['Date/Time', 'time', '#8E5CF5'],
    ['Device Events', 'phone-portrait', A.red],
    ['Location', 'location', '#1E88E5'],
    ['Sensors', 'pulse', '#6D4C41'],
  ];
  const phase = usePhase(2, 2400);
  return (
    <Droid>
      <Bar title="Add Trigger" right={<Ionicons name="search" size={13} color="#fff" />} />
      {phase === 0 ? (
        <View style={{ marginTop: 6 }}>
          {cats.map(([t, ic, color], i) => (
            <Item key={t} icon={ic} color={color} title={t} right={<Ionicons name="chevron-down" size={11} color={A.soft} />} last={i === cats.length - 1} />
          ))}
        </View>
      ) : (
        <View style={{ height: H - 70, overflow: 'hidden', marginTop: 6 }}>
          <Scroller distance={60}>
            <Item icon="phone-portrait" color={A.red} title="Device Events" right={<Ionicons name="chevron-up" size={11} color={A.soft} />} />
            {['Clipboard Change', 'Dark Theme Change', 'Device Boot', 'Media Button', 'Notification', 'Screen On/Off', 'Silent Mode'].map((t) => (
              <Item key={t} icon={t === 'Notification' ? 'notifications' : 'ellipse'} color={t === 'Notification' ? A.red : '#C9CCD3'} title={t} />
            ))}
          </Scroller>
        </View>
      )}
      <Taps key={phase} points={[phase === 0 ? { x: 70, y: 40 + 6 + 5 * 37 + 18 } : { x: 80, y: 40 + 6 + 5 * 37 + 18 - 60 }]} />
    </Droid>
  );
}

function AppsScreen() {
  const phase = usePhase(3, 1900);
  return (
    <Droid>
      <Editor />
      {phase === 0 && (
        <Dialog title="Notification">
          <Radio label="Notification Received" on />
          <Radio label="Notification Cleared" />
        </Dialog>
      )}
      {phase === 1 && (
        <Dialog title="Select Applications">
          <Radio label="Select Applications" on />
          <Radio label="Any Application" />
        </Dialog>
      )}
      {phase === 2 && (
        <Dialog title="Select Applications">
          <Check label="Messages" icon="chatbubble" color="#1A73E8" />
          <Check label="Samsung Wallet" icon="card" color="#1428A0" on />
          <Check label="Settings" icon="settings" color="#5F6368" />
          <Check label="Wallet" icon="wallet" color="#1A73E8" on />
        </Dialog>
      )}
      <Taps key={phase} points={[[{ x: W - 40, y: 248 }], [{ x: W - 40, y: 248 }], [{ x: 70, y: 216 }, { x: 70, y: 260 }, { x: W - 40, y: 296 }]][phase]} />
    </Droid>
  );
}

function TextScreen() {
  return (
    <Droid>
      <Editor />
      <Dialog title="Text content">
        <Radio label="Any" />
        <Radio label="Matches" />
        <Radio label="Contains" on />
        <Radio label="Excludes" />
        <View style={{ borderBottomWidth: 1.5, borderBottomColor: A.primary, paddingVertical: 4, marginTop: 4 }}>
          <T size={10}>{'\\d[.,]\\d\\d'}</T>
        </View>
        <Check label="Enable regex" on />
      </Dialog>
      <Taps points={[{ x: 50, y: 168 }, { x: 90, y: 218 }, { x: 60, y: 244 }, { x: W - 40, y: 276 }]} />
    </Droid>
  );
}

function ActionScreen() {
  const phase = usePhase(2, 2200);
  const cats: [string, Icon, string][] = [
    ['Applications', 'apps', '#F08A24'],
    ['Connectivity', 'wifi', A.blue],
    ['Device Actions', 'phone-portrait', A.red],
    ['Notification', 'notifications', '#8E5CF5'],
    ['Web Interactions', 'globe-outline', A.blue],
  ];
  return (
    <Droid>
      {phase === 0 ? (
        <>
          <Editor trigger />
          <Taps points={[{ x: W - 22, y: 40 + 8 + 13 + 26 + 37 + 8 + 13 }]} />
        </>
      ) : (
        <>
          <Bar title="Add Action" right={<Ionicons name="search" size={13} color="#fff" />} />
          <View style={{ marginTop: 6 }}>
            {cats.map(([t, ic, color]) => (
              <Item key={t} icon={ic} color={color} title={t} right={<Ionicons name={t === 'Web Interactions' ? 'chevron-up' : 'chevron-down'} size={11} color={A.soft} />} />
            ))}
            {['HTTP Request', 'Open Website / HTTP GET', 'Webhook'].map((t, i) => (
              <Item key={t} icon="ellipse" color={i === 0 ? A.blue : '#C9CCD3'} title={t} />
            ))}
          </View>
          <Taps points={[{ x: 90, y: 40 + 6 + 4 * 37 + 18 }, { x: 80, y: 40 + 6 + 5 * 37 + 18 }]} />
        </>
      )}
    </Droid>
  );
}

function RequestScreen({ tab }: { tab: 'settings' | 'body' }) {
  const field = (label: string, value: string, on: boolean) => (
    <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
      <T size={8.5} color={A.soft}>
        {label}
      </T>
      <View style={{ borderBottomWidth: on ? 1.5 : 1, borderBottomColor: on ? A.primary : A.line, paddingVertical: 3 }}>
        <T size={10} color={on ? A.text : A.soft}>
          {value}
        </T>
      </View>
    </View>
  );
  return (
    <Droid>
      <Bar title="HTTP Request" right={<Ionicons name="checkmark" size={15} color="#fff" />} />
      <Row style={{ backgroundColor: A.primary, paddingHorizontal: 8, gap: 12, height: 26 }}>
        {['SETTINGS', 'QUERY', 'HEADERS', 'CONTENT BODY'].map((t) => {
          const on = (tab === 'settings' && t === 'SETTINGS') || (tab === 'body' && t === 'CONTENT BODY');
          return (
            <View key={t} style={{ height: 26, justifyContent: 'center', borderBottomWidth: on ? 2 : 0, borderBottomColor: '#fff' }}>
              <T size={8} weight="semibold" color={on ? '#fff' : 'rgba(255,255,255,0.65)'}>
                {t}
              </T>
            </View>
          );
        })}
      </Row>
      <View style={{ backgroundColor: A.card, marginTop: 6 }}>
        {tab === 'settings' ? (
          <>
            {field('Request method', 'POST', true)}
            {field('URL', 'https://…supabase.co/rest/v1/rpc/log_payment?apikey=…', true)}
            {field('Timeout (s)', '30', false)}
          </>
        ) : (
          <>
            {field('Content type', 'application/json', true)}
            <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
              <T size={8.5} color={A.soft}>
                Content
              </T>
              <View style={{ borderWidth: 1.5, borderColor: A.primary, borderRadius: 6, padding: 6, marginTop: 3 }}>
                <Text style={{ fontSize: 8.5, lineHeight: 12, fontFamily: FONT.medium, color: A.text }}>
                  {'{"token":"3fa9…","amount":"{notification}","merchant":"{not_title}","card":"{not_app_name}: {notification}"}'}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
      <Taps points={tab === 'settings' ? [{ x: 60, y: 40 + 26 + 6 + 26 }, { x: 120, y: 40 + 26 + 6 + 66 }] : [{ x: W - 30, y: 40 + 13 }, { x: 90, y: 40 + 26 + 6 + 26 }, { x: 110, y: 40 + 26 + 6 + 86 }]} />
    </Droid>
  );
}

function SaveScreen() {
  return (
    <Droid>
      <Editor trigger action named />
      <Taps points={[{ x: 90, y: 20 }, { x: W - 22, y: 20 }]} />
    </Droid>
  );
}

const LinkScreen = () => <RequestScreen tab="settings" />;
const BodyScreen = () => <RequestScreen tab="body" />;

export const WALLET_MOCKS = [InstallScreen, AddMacroScreen, TriggerScreen, AppsScreen, TextScreen, ActionScreen, LinkScreen, BodyScreen, SaveScreen];

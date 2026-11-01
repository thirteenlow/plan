import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { Screen } from '@/components/Screen';
import { Button, Card, confirm, Divider, haptic, ProgressBar, Row, Tap, TextField, Txt } from '@/components/ui';
import { completeSetup, completeUnlock, deleteAccount, resetEncryption, signOutEverywhereOnDevice } from '@/cloud';
import { nativeAppleAvailable, sendEmailCode, signInWithAppleNative, signInWithProvider, verifyEmailCode } from '@/cloud/auth';
import { friendlyError, useCloud } from '@/cloud/cloudStore';
import { APPLE_SIGN_IN_ENABLED, cloudConfigured } from '@/cloud/config';
import { PASSWORD_RULES, validatePassword } from '@/cloud/identity';
import { pullAll, removeLockedBudgets } from '@/cloud/sync';
import { useStore } from '@/store/store';
import { GRADIENT_SOFT, RADIUS, useTheme } from '@/theme';

export default function AccountScreen() {
  const { status, user, error, notice, syncing, lastSyncAt, locked } = useCloud();
  const sync = useStore((s) => s.sync);
  const budgets = useStore((s) => s.budgets);
  const shared = Object.keys(sync).filter((id) => budgets[id]);
  // Reached as the sign-in gate (not from Settings): no way back, and continue into the app once ready.
  const [asGate] = useState(() => cloudConfigured && useCloud.getState().status !== 'ready');
  useEffect(() => {
    if (asGate && status === 'ready') router.replace('/');
  }, [asGate, status]);

  if (status === 'signedOut') return <SignIn />;

  return (
    <Screen back={asGate ? undefined : 'back'} title={asGate ? undefined : 'Account & sync'} maxWidth={asGate ? 420 : 560}>
      {!!notice && <Banner tone="info" text={notice} onClose={() => useCloud.setState({ notice: null })} />}
      {!!error && status !== 'ready' && <Banner tone="error" text={error} onClose={() => useCloud.setState({ error: null })} />}

      {status === 'unconfigured' && <NotConfigured />}
      {(status === 'starting' || status === 'loading') && (
        <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
          <ActivityIndicator />
          <Txt tone="muted">Checking your account…</Txt>
        </View>
      )}
      {status === 'needsSetup' && <PasswordForm mode="setup" />}
      {status === 'needsUnlock' && <PasswordForm mode="unlock" />}
      {status === 'ready' && user && (
        <>
          <Card style={{ gap: 12 }}>
            <Row style={{ gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#14B57A22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark" size={22} color="#14B57A" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="strong" numberOfLines={1}>
                  {user.name || user.email}
                </Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {user.email} · end-to-end encrypted
                </Txt>
              </View>
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt tone="soft">{syncing ? 'Syncing…' : lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet'}</Txt>
              <Button title="Sync now" small variant="soft" icon="sync-outline" loading={syncing} onPress={() => void pullAll()} />
            </Row>
            {!!error && (
              <Txt variant="caption" tone="danger">
                {error}
              </Txt>
            )}
          </Card>

          {locked > 0 && (
            <Card style={{ gap: 10, marginTop: 14 }}>
              <Row style={{ gap: 10 }}>
                <Ionicons name="lock-closed" size={18} color="#E8A019" />
                <Txt variant="strong" style={{ flex: 1 }}>
                  {locked === 1 ? '1 budget can’t be opened' : `${locked} budgets can’t be opened`}
                </Txt>
              </Row>
              <Txt variant="caption" tone="soft">
                {locked === 1 ? 'It was' : 'They were'} saved with an older password. Remove {locked === 1 ? 'it' : 'them'} from your account to stop sync errors.
              </Txt>
              <Button
                title="Remove from account"
                variant="danger"
                small
                onPress={async () => {
                  if (!(await confirm('Remove locked budgets', 'This can’t be undone. Anyone else sharing them keeps their copy.', 'Remove', true))) return;
                  try {
                    await removeLockedBudgets();
                  } catch (e) {
                    useCloud.setState({ error: friendlyError(e) });
                  }
                }}
              />
            </Card>
          )}

          <Txt variant="overline" tone="muted" style={{ marginTop: 22, marginBottom: 10, marginLeft: 4 }}>
            Budgets on your account
          </Txt>
          <Card style={{ paddingVertical: 4 }}>
            {shared.length === 0 ? (
              <Txt tone="muted" style={{ paddingVertical: 12 }}>
                None yet. Budgets you create are saved here automatically.
              </Txt>
            ) : (
              shared.map((id, i) => (
                <View key={id}>
                  {i > 0 && <Divider />}
                  <Tap onPress={() => router.push({ pathname: '/share/[id]', params: { id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
                    <Ionicons name="people" size={18} color="#9A5CF5" />
                    <Txt variant="body" style={{ flex: 1 }}>
                      {budgets[id].name}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {sync[id].role === 'owner' ? 'Owner' : 'Member'}
                    </Txt>
                    <Ionicons name="chevron-forward" size={16} color="#9AA2B6" />
                  </Tap>
                </View>
              ))
            )}
          </Card>
          <Button title="Manage budgets" variant="soft" icon="albums-outline" style={{ marginTop: 14 }} onPress={() => router.push('/budgets')} />
          <DeleteAccount />
          <Button
            title="Sign out"
            variant="outline"
            style={{ marginTop: 10 }}
            onPress={async () => {
              if (
                await confirm(
                  'Sign out',
                  'Your budgets stay on your account and are removed from this device.',
                  'Sign out',
                )
              ) {
                await signOutEverywhereOnDevice();
              }
            }}
          />
        </>
      )}
      {!asGate && <PrivacyNote />}
    </Screen>
  );
}

/** The landing page: logo, one line, and the ways to sign in. */
function SignIn() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { notice, error } = useCloud();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [appleNative, setAppleNative] = useState(false);
  useEffect(() => {
    if (APPLE_SIGN_IN_ENABLED) void nativeAppleAvailable().then(setAppleNative);
  }, []);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {!isDark && <LinearGradient colors={GRADIENT_SOFT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1, width: '100%', maxWidth: 400, alignSelf: 'center' }}>
          <View style={{ flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center' }}>
            <BrandMark size={84} />
            <Txt variant="display" style={{ marginTop: 20 }}>
              Plan
            </Txt>
            <Txt tone="soft" center style={{ marginTop: 6 }}>
              Give every dollar a job.
            </Txt>
          </View>

          <View style={{ gap: 12 }}>
            {!!notice && <Banner tone="info" text={notice} onClose={() => useCloud.setState({ notice: null })} />}
            {!!error && <Banner tone="error" text={error} onClose={() => useCloud.setState({ error: null })} />}
            <Tap
              onPress={() => run('google', () => signInWithProvider('google'))}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              style={{
                height: 52,
                borderRadius: RADIUS.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              {busy === 'google' ? <ActivityIndicator /> : <Ionicons name="logo-google" size={18} color={colors.text} />}
              <Txt variant="strong">Continue with Google</Txt>
            </Tap>
            {APPLE_SIGN_IN_ENABLED &&
              (appleNative ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={RADIUS.lg}
                  style={{ height: 52 }}
                  onPress={() => run('apple', signInWithAppleNative)}
                />
              ) : (
                <Tap
                  onPress={() => run('apple', () => signInWithProvider('apple'))}
                  disabled={!!busy}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Apple"
                  style={{ height: 52, borderRadius: RADIUS.lg, backgroundColor: isDark ? '#FFF' : '#000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                >
                  {busy === 'apple' ? <ActivityIndicator color={isDark ? '#000' : '#FFF'} /> : <Ionicons name="logo-apple" size={20} color={isDark ? '#000' : '#FFF'} />}
                  <Txt variant="strong" style={{ color: isDark ? '#000' : '#FFF' }}>
                    Continue with Apple
                  </Txt>
                </Tap>
              ))}
            <Row style={{ gap: 10, marginVertical: 2 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Txt variant="caption" tone="muted">
                or
              </Txt>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </Row>
            <EmailSignIn disabled={!!busy && busy !== 'email'} />
            {!!err && (
              <Txt variant="caption" tone="danger" center>
                {err}
              </Txt>
            )}
          </View>

          <Tap onPress={() => router.push('/privacy')} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 28 }}>
            <Ionicons name="lock-closed" size={12} color={colors.muted} />
            <Txt variant="caption" tone="muted">
              End-to-end encrypted · Privacy
            </Txt>
          </Tap>
        </View>
      </ScrollView>
    </View>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Two steps: send a one-time code to an email address, then type the code in. */
function EmailSignIn({ disabled }: { disabled: boolean }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (to: string) => {
    if (!EMAIL_PATTERN.test(to)) return setErr('Enter a valid email address.');
    setBusy(true);
    setErr(null);
    try {
      await sendEmailCode(to);
      setSentTo(to);
      setCode('');
      setCooldown(60);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!sentTo || code.length < 6) return setErr('Enter the code from the email.');
    setBusy(true);
    setErr(null);
    try {
      await verifyEmailCode(sentTo, code);
      haptic('success');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!sentTo) {
    return (
      <View style={{ gap: 10 }}>
        <TextField
          icon="mail-outline"
          placeholder="you@example.com"
          value={email}
          onChangeText={(t) => {
            setEmail(t.replace(/\s/g, ''));
            setErr(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={254}
          error={err}
          onSubmitEditing={() => void send(email)}
        />
        <Button title="Continue with email" loading={busy} disabled={disabled || !email} onPress={() => void send(email)} />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Txt tone="soft" center>
        Code sent to <Txt variant="strong">{sentTo}</Txt>
      </Txt>
      <TextField
        icon="keypad-outline"
        placeholder="6-digit code"
        value={code}
        onChangeText={(t) => {
          setCode(t);
          setErr(null);
        }}
        filter={(t) => t.replace(/\D/g, '').slice(0, 10)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        autoFocus
        error={err}
        onSubmitEditing={() => void verify()}
      />
      <Button title="Sign in" loading={busy} disabled={code.length < 6} onPress={() => void verify()} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title="Change email" variant="ghost" small onPress={() => setSentTo(null)} />
        <Button title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'} variant="ghost" small disabled={cooldown > 0 || busy} onPress={() => void send(sentTo)} />
      </Row>
    </View>
  );
}

type PasswordStage = 'create' | 'unlock' | 'verify' | 'reset';

/** Create the password (first sign-in), enter it (new device), or reset it after confirming an emailed code. */
function PasswordForm({ mode }: { mode: 'setup' | 'unlock' }) {
  const user = useCloud((s) => s.user);
  const { colors } = useTheme();
  const [stage, setStage] = useState<PasswordStage>(mode === 'setup' ? 'create' : 'unlock');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const email = user?.email ?? '';
  const choosing = stage === 'create' || stage === 'reset';
  const rulesMet = PASSWORD_RULES.every((r) => r.test(pass));
  const matches = !!confirmPass && pass === confirmPass;

  const goTo = (next: PasswordStage) => {
    setStage(next);
    setErr(null);
    setPass('');
    setConfirmPass('');
    setCode('');
  };

  const sendCode = async () => {
    setBusy(true);
    setErr(null);
    try {
      await sendEmailCode(email);
      goTo('verify');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async () => {
    setBusy(true);
    setErr(null);
    try {
      await verifyEmailCode(email, code);
      haptic('success');
      goTo('reset');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (stage === 'verify') return checkCode();
    setErr(null);
    if (choosing) {
      const v = validatePassword(pass, confirmPass, email);
      if (v) return setErr(v);
    } else if (!pass) {
      return setErr('Enter your password.');
    }
    setProgress(0);
    try {
      if (stage === 'reset') await resetEncryption(pass, setProgress);
      else if (stage === 'create') await completeSetup(pass, setProgress);
      else await completeUnlock(pass, setProgress);
      haptic('success');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setProgress(null);
    }
  };

  const copy: Record<PasswordStage, [string, string, string]> = {
    create: ['Create a password', 'It keeps your budgets private. Plan can’t see it or recover it.', 'Create password'],
    unlock: ['Enter your password', email, 'Unlock'],
    verify: ['Check your email', `Enter the code we sent to ${email}.`, 'Continue'],
    reset: ['Set a new password', 'Budgets on this device are kept. Budgets only stored online can’t be recovered.', 'Save new password'],
  };
  const [title, subtitle, action] = copy[stage];
  const ready = stage === 'verify' ? code.length >= 6 : choosing ? rulesMet && matches : !!pass;

  const eye = (
    <Tap onPress={() => setShow(!show)} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'}>
      <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
    </Tap>
  );

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 56, height: 56, borderRadius: 18, marginBottom: 10 }} accessibilityIgnoresInvertColors />
        <Txt variant="h2" center>
          {title}
        </Txt>
        <Txt tone="soft" center>
          {subtitle}
        </Txt>
      </View>

      {stage === 'verify' ? (
        <TextField
          icon="keypad-outline"
          placeholder="6-digit code"
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setErr(null);
          }}
          filter={(t) => t.replace(/\D/g, '').slice(0, 10)}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={10}
          autoFocus
          onSubmitEditing={() => void submit()}
        />
      ) : (
        <>
          <TextField
            label={choosing ? 'Password' : undefined}
            icon="lock-closed-outline"
            placeholder={choosing ? 'New password' : 'Password'}
            value={pass}
            onChangeText={(t) => {
              setPass(t);
              setErr(null);
            }}
            filter={(t) => t.slice(0, 128)}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={choosing ? 'new-password' : 'current-password'}
            textContentType={choosing ? 'newPassword' : 'password'}
            maxLength={128}
            autoFocus
            right={eye}
            onSubmitEditing={() => void submit()}
          />
          {choosing && (
            <>
              <View style={{ gap: 6, paddingHorizontal: 4 }}>
                {PASSWORD_RULES.map((r) => {
                  const ok = r.test(pass);
                  return (
                    <Row key={r.label} style={{ gap: 8 }}>
                      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? colors.positive : colors.muted} />
                      <Txt variant="caption" tone={ok ? 'default' : 'muted'}>
                        {r.label}
                      </Txt>
                    </Row>
                  );
                })}
              </View>
              <TextField
                label="Confirm password"
                icon="lock-closed-outline"
                placeholder="Type it again"
                value={confirmPass}
                onChangeText={(t) => {
                  setConfirmPass(t);
                  setErr(null);
                }}
                filter={(t) => t.slice(0, 128)}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={128}
                right={confirmPass ? <Ionicons name={matches ? 'checkmark-circle' : 'close-circle'} size={20} color={matches ? colors.positive : colors.danger} /> : undefined}
                onSubmitEditing={() => void submit()}
              />
            </>
          )}
        </>
      )}

      {!!err && (
        <Txt variant="caption" tone="danger" center>
          {err}
        </Txt>
      )}
      {progress !== null && <ProgressBar progress={progress} height={5} />}
      <Button title={action} loading={busy || progress !== null} disabled={!ready} onPress={() => void submit()} />

      {stage === 'unlock' && <Button title="Forgot password?" variant="ghost" small loading={busy} onPress={() => void sendCode()} />}
      {stage === 'verify' && <Button title="Resend code" variant="ghost" small disabled={busy} onPress={() => void sendCode()} />}
      {(stage === 'verify' || stage === 'reset') && <Button title="Back" variant="ghost" small onPress={() => goTo('unlock')} />}
      <Button title="Use a different account" variant="ghost" small onPress={() => void signOutEverywhereOnDevice()} />
    </View>
  );
}

function NotConfigured() {
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ gap: 10 }}>
        <Ionicons name="cloud-offline-outline" size={22} color="#9AA2B6" />
        <Txt variant="h3">Sharing isn’t set up yet</Txt>
      </Row>
      <Txt tone="soft">
        Shared budgets need a (free) Supabase project. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to a .env file and restart the app. Step-by-step instructions are in
        docs/CLOUD_SETUP.md.
      </Txt>
      <Txt variant="caption" tone="muted">
        Everything else in Plan works offline and stays encrypted on this device.
      </Txt>
    </Card>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <Button title="Delete account" variant="danger" icon="trash-outline" style={{ marginTop: 10 }} onPress={() => setOpen(true)} />;
  return (
    <Card style={{ marginTop: 10, gap: 10 }}>
      <Txt variant="h3" tone="danger">
        Delete your account
      </Txt>
      <Txt tone="soft">
        This permanently deletes your account, your encryption key backup and every budget you own from the server, for everyone you shared them with. You’ll be removed from budgets others shared with you, and everything is cleared from this device.
      </Txt>
      <TextField label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} maxLength={10} error={err} />
      <Row style={{ gap: 10 }}>
        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button
          title="Delete forever"
          variant="danger"
          style={{ flex: 1 }}
          disabled={typed.trim() !== 'DELETE'}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setErr(null);
            try {
              await deleteAccount();
            } catch (e) {
              setErr(friendlyError(e));
              setBusy(false);
            }
          }}
        />
      </Row>
    </Card>
  );
}

/** Where the device key actually lives, per platform (browsers have no Keychain/Keystore). */
const DEVICE_KEY_NOTE: Record<string, string> = {
  android: 'On this device, the key is kept in the Android Keystore.',
  ios: 'On this device, the key is kept in the iOS Keychain.',
  web: 'In a browser, the key sits in browser storage, so avoid shared computers.',
};

function PrivacyNote() {
  return (
    <Card style={{ marginTop: 22, gap: 8 }}>
      <Row style={{ gap: 8 }}>
        <Ionicons name="lock-closed" size={16} color="#14B57A" />
        <Txt variant="strong">How your data is protected</Txt>
      </Row>
      {[
        DEVICE_KEY_NOTE[Platform.OS] ?? DEVICE_KEY_NOTE.web,
        'Budgets are encrypted on your device (XChaCha20-Poly1305). The server only sees ciphertext.',
        'Each budget has its own key per member. Removing someone rotates it.',
        'Your key backup is locked with your password (scrypt).',
      ].map((t) => (
        <Row key={t} style={{ gap: 8, alignItems: 'flex-start' }}>
          <Txt tone="muted">•</Txt>
          <Txt variant="caption" tone="soft" style={{ flex: 1 }}>
            {t}
          </Txt>
        </Row>
      ))}
    </Card>
  );
}

function Banner({ tone, text, onClose }: { tone: 'info' | 'error'; text: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Row style={{ gap: 10, padding: 12, borderRadius: RADIUS.md, marginBottom: 14, backgroundColor: tone === 'error' ? colors.dangerSoft : colors.accentSoft }}>
      <Ionicons name={tone === 'error' ? 'alert-circle' : 'information-circle'} size={18} color={tone === 'error' ? colors.danger : colors.accent} />
      <Txt variant="caption" style={{ flex: 1, color: tone === 'error' ? colors.danger : colors.accent }}>
        {text}
      </Txt>
      <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color={colors.muted} />
      </Tap>
    </Row>
  );
}

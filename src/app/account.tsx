import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { RecoveryCodeView } from '@/components/RecoveryCode';
import { Screen } from '@/components/Screen';
import { Button, Card, confirm, Divider, haptic, ProgressBar, Row, Tap, TextField, Txt } from '@/components/ui';
import {
  completeSetup,
  completeUnlock,
  deleteAccount,
  finishRecovery,
  newRecoveryCode,
  recoverWithOldPassword,
  resetEncryption,
  setPrivacy,
  signOutEverywhereOnDevice,
  skipRecoveryCode,
  unlockWithCode,
} from '@/cloud';
import { nativeAppleAvailable, sendEmailCode, signInWithAppleNative, signInWithProvider, verifyEmailCode } from '@/cloud/auth';
import { friendlyError, isSimple, useCloud } from '@/cloud/cloudStore';
import { APPLE_SIGN_IN_ENABLED, cloudConfigured } from '@/cloud/config';
import { changePassword, normalizeRecoveryCode, PASSWORD_RULES, validatePassword } from '@/cloud/identity';
import { pullAll, removeLockedBudgets } from '@/cloud/sync';
import { useStore } from '@/store/store';
import { GRADIENT_SOFT, RADIUS, useTheme } from '@/theme';

export default function AccountScreen() {
  const { status, user, profile, error, notice, syncing, lastSyncAt, locked, hasRecovery, recoveryCode } = useCloud();
  const simple = isSimple(profile);
  const sync = useStore((s) => s.sync);
  const budgets = useStore((s) => s.budgets);
  const shared = Object.keys(sync).filter((id) => budgets[id]);
  // Reached as the sign-in gate (not from Settings): no way back, and continue into the app once ready
  // (after a new recovery code has been saved).
  const [asGate] = useState(() => cloudConfigured && useCloud.getState().status !== 'ready');
  useEffect(() => {
    if (asGate && status === 'ready' && !recoveryCode) router.replace('/');
  }, [asGate, status, recoveryCode]);

  if (status === 'signedOut') return <SignIn />;
  if (status === 'ready' && recoveryCode)
    return (
      <Screen maxWidth={420}>
        <RecoveryCodeView code={recoveryCode} onDone={() => useCloud.setState({ recoveryCode: null })} onSkip={() => void skipRecoveryCode()} />
      </Screen>
    );

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
                  {user.email} · {simple ? 'encrypted' : 'end-to-end encrypted'}
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

          {!simple && hasRecovery === false && <RecoverySetup />}
          {locked > 0 && <LockedBudgets count={locked} />}

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
          <PrivacySetting simple={simple} email={user.email} />
          {!simple && <ChangePassword email={user.email} />}
          {!simple && hasRecovery && <RenewRecoveryCode />}
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

type PasswordStage = 'choose' | 'create' | 'unlock' | 'recover' | 'newpass' | 'verify' | 'reset';
const signedInRecently = (at: string | undefined) => !!at && Date.now() - Date.parse(at) < 15 * 60_000;

/**
 * First sign-in: pick Simple (done, no password) or Private (create a password). New device on Private: enter it. Forgot it: the recovery code opens everything and
 * sets a new one; without the code, a reset (after a fresh sign-in or emailed code) starts over.
 */
function PasswordForm({ mode }: { mode: 'setup' | 'unlock' }) {
  const user = useCloud((s) => s.user);
  const { colors } = useTheme();
  const [stage, setStage] = useState<PasswordStage>(mode === 'setup' ? 'choose' : 'unlock');
  // Starting over after a forgotten password (vs. first setup): the same choice, but it replaces the old keys.
  const [resetting, setResetting] = useState(false);
  const [simple, setSimple] = useState(true);
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const email = user?.email ?? '';
  const choosing = stage === 'create' || stage === 'reset' || stage === 'newpass';
  const rulesMet = PASSWORD_RULES.every((r) => r.test(pass));
  const matches = !!confirmPass && pass === confirmPass;

  const goTo = (next: PasswordStage) => {
    setStage(next);
    setErr(null);
    setPass('');
    setConfirmPass('');
    setCode('');
  };

  const lostCode = async () => {
    if (!(await confirm('No recovery code?', 'Starting over locks budgets that aren’t on this device, unless you remember the old password.', 'Start over', true))) return;
    forgot();
  };

  const forgot = () => {
    // Just signed in (Google, Apple or an email code) proves it's you; another emailed code adds nothing.
    if (signedInRecently(user?.signedInAt)) startOver();
    else void sendCode();
  };

  const startOver = () => {
    setResetting(true);
    goTo('choose');
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
      startOver();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (stage === 'verify') return checkCode();
    setErr(null);
    if (stage === 'choose' && !simple) return goTo(resetting ? 'reset' : 'create');
    if (stage === 'choose') {
      setProgress(0);
      try {
        await (resetting ? resetEncryption(null, setProgress) : completeSetup(null, setProgress));
        haptic('success');
      } catch (e) {
        setErr(friendlyError(e));
      } finally {
        setProgress(null);
      }
      return;
    }
    if (stage === 'recover') {
      setProgress(0);
      try {
        await unlockWithCode(code, setProgress);
        haptic('success');
        goTo('newpass');
      } catch (e) {
        setErr(friendlyError(e));
      } finally {
        setProgress(null);
      }
      return;
    }
    if (choosing) {
      const v = validatePassword(pass, confirmPass, email);
      if (v) return setErr(v);
    } else if (!pass) {
      return setErr('Enter your password.');
    }
    setProgress(0);
    try {
      if (stage === 'reset') await resetEncryption(pass, setProgress);
      else if (stage === 'newpass') await finishRecovery(pass, setProgress);
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
    // Not a sign-in password (Google, Apple or the email code did that): it locks the encryption key, and each device
    // keeps the key once unlocked, so people only see this once per device.
    choose: [resetting ? 'Start over' : 'Choose your privacy', resetting ? 'Budgets not on this device stay locked.' : 'You can change this later.', 'Continue'],
    create: ['Lock your budgets', 'Only you can read them. Not even Plan.', 'Create password'],
    unlock: ['Unlock your budgets', 'Enter your encryption password. This device will remember it.', 'Unlock'],
    recover: ['Enter your recovery code', 'The 20-character code you saved when you set your password.', 'Continue'],
    newpass: ['You’re in', 'Everything’s safe. Choose a new password.', 'Save password'],
    verify: ['Check your email', `Enter the code sent to ${email}.`, 'Continue'],
    reset: ['Set a new password', 'Only you will be able to read your budgets.', 'Save password'],
  };
  const [title, subtitle, action] = copy[stage];
  const ready = stage === 'choose' ? true : stage === 'verify' ? code.length >= 6 : stage === 'recover' ? normalizeRecoveryCode(code).length === 20 : choosing ? rulesMet && matches : !!pass;

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

      {stage === 'choose' ? (
        <View style={{ gap: 10 }}>
          <PrivacyOption icon="flash" title="Simple" tag="Recommended" text="Just sign in. Nothing to remember." selected={simple} onPress={() => setSimple(true)} />
          <PrivacyOption icon="lock-closed" title="Private" text="Only you can read your budgets, not even Plan. Needs a password." selected={!simple} onPress={() => setSimple(false)} />
        </View>
      ) : stage === 'recover' ? (
        <TextField
          icon="key-outline"
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setErr(null);
          }}
          filter={(t) => t.toUpperCase().slice(0, 30)}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={30}
          autoFocus
          onSubmitEditing={() => void submit()}
        />
      ) : stage === 'verify' ? (
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

      {stage === 'unlock' && <Button title="Forgot password?" variant="ghost" small onPress={() => goTo('recover')} />}
      {stage === 'recover' && <Button title="Lost your code?" variant="ghost" small loading={busy} onPress={() => void lostCode()} />}
      {stage === 'verify' && <Button title="Resend code" variant="ghost" small disabled={busy} onPress={() => void sendCode()} />}
      {(stage === 'recover' || stage === 'verify' || (stage === 'choose' && resetting)) && <Button title="Back" variant="ghost" small onPress={() => goTo('unlock')} />}
      {(stage === 'create' || stage === 'reset') && <Button title="Back" variant="ghost" small onPress={() => goTo('choose')} />}
      <Button title="Use a different account" variant="ghost" small onPress={() => void signOutEverywhereOnDevice()} />
    </View>
  );
}

/** One of the two privacy choices: a tappable card with a radio dot. */
function PrivacyOption({ icon, title, tag, text, selected, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; tag?: string; text: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surface }}
    >
      <Ionicons name={icon} size={22} color={selected ? colors.accent : colors.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ gap: 8 }}>
          <Txt variant="strong">{title}</Txt>
          {!!tag && (
            <Txt variant="caption" style={{ color: colors.accent, fontWeight: '700' }}>
              {tag}
            </Txt>
          )}
        </Row>
        <Txt variant="caption" tone="soft">
          {text}
        </Txt>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.accent : colors.muted} />
    </Tap>
  );
}

/** For accounts from before recovery codes: without one, a forgotten password means losing everything. */
function RecoverySetup() {
  const { colors } = useTheme();
  const [progress, setProgress] = useState<number | null>(null);
  const create = async () => {
    setProgress(0);
    try {
      await newRecoveryCode(setProgress);
    } catch (e) {
      useCloud.setState({ error: friendlyError(e) });
    } finally {
      setProgress(null);
    }
  };
  return (
    <Card style={{ gap: 10, marginTop: 14, borderWidth: 1, borderColor: colors.warning }}>
      <Row style={{ gap: 10 }}>
        <Ionicons name="key" size={18} color={colors.warning} />
        <Txt variant="strong" style={{ flex: 1 }}>
          Add a recovery code
        </Txt>
      </Row>
      <Txt variant="caption" tone="soft">
        Forget your password without one and your budgets are gone for good.
      </Txt>
      {progress !== null && <ProgressBar progress={progress} height={5} />}
      <Button title="Create recovery code" small loading={progress !== null} onPress={() => void create()} />
    </Card>
  );
}

/** A fresh recovery code (if the old one was lost or seen by someone). */
function RenewRecoveryCode() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      title="New recovery code"
      variant="ghost"
      icon="key-outline"
      loading={busy}
      onPress={async () => {
        if (!(await confirm('New recovery code', 'Your old code will stop working.', 'Create'))) return;
        setBusy(true);
        try {
          await newRecoveryCode();
        } catch (e) {
          useCloud.setState({ error: friendlyError(e) });
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

/** Simple or Private, and switching between them (same key, so nothing is lost either way). */
function PrivacySetting({ simple, email }: { simple: boolean; email: string }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Card style={{ gap: 10, marginTop: 14 }}>
      <Row style={{ gap: 10 }}>
        <Ionicons name={simple ? 'flash' : 'lock-closed'} size={18} color={colors.accent} />
        <Txt variant="strong" style={{ flex: 1 }}>
          {simple ? 'Simple' : 'Private'}
        </Txt>
      </Row>
      <Txt variant="caption" tone="soft">
        {simple ? 'No password needed. Plan could technically read your budgets.' : 'Only you can read your budgets. Not even Plan.'}
      </Txt>
      {simple ? (
        <ChangePassword email={email} toPrivate />
      ) : (
        <Button
          title="Switch to Simple"
          variant="ghost"
          small
          loading={busy}
          onPress={async () => {
            if (!(await confirm('Switch to Simple?', 'No more password. Plan could technically read your budgets.', 'Switch'))) return;
            setBusy(true);
            try {
              await setPrivacy(null);
              useCloud.setState({ notice: 'Switched to Simple.' });
            } catch (e) {
              useCloud.setState({ error: friendlyError(e) });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Card>
  );
}

/** New encryption password from an unlocked device (keeps every budget, unlike a reset), or the one for going Private. */
function ChangePassword({ email, toPrivate }: { email: string; toPrivate?: boolean }) {
  const user = useCloud((s) => s.user);
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const ready = PASSWORD_RULES.every((r) => r.test(pass)) && !!confirmPass && pass === confirmPass;

  // Inside the privacy card when going Private; a card of its own otherwise.
  const Wrap = toPrivate ? View : Card;
  if (!open)
    return toPrivate ? (
      <Button title="Switch to Private" variant="soft" small onPress={() => setOpen(true)} />
    ) : (
      <Button title="Change encryption password" variant="ghost" icon="key-outline" style={{ marginTop: 6 }} onPress={() => setOpen(true)} />
    );

  const save = async () => {
    const v = validatePassword(pass, confirmPass, email);
    if (v) return setErr(v);
    if (!user) return;
    setErr(null);
    setProgress(0);
    try {
      if (toPrivate) await setPrivacy(pass, setProgress);
      else await changePassword(user, pass, setProgress);
      haptic('success');
      setOpen(false);
      setPass('');
      setConfirmPass('');
      useCloud.setState({ notice: toPrivate ? 'You’re Private now.' : 'Password changed.' });
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Wrap style={{ gap: 10, marginTop: toPrivate ? 0 : 14 }}>
      {!toPrivate && <Txt variant="strong">Change encryption password</Txt>}
      <Txt variant="caption" tone="soft">
        {toPrivate ? 'Choose a password. You’ll need it once on each new device.' : 'Your budgets stay as they are.'}
      </Txt>
      <TextField icon="lock-closed-outline" placeholder="New password" value={pass} onChangeText={(t) => (setPass(t), setErr(null))} filter={(t) => t.slice(0, 128)} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={128} />
      <TextField icon="lock-closed-outline" placeholder="Type it again" value={confirmPass} onChangeText={(t) => (setConfirmPass(t), setErr(null))} filter={(t) => t.slice(0, 128)} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={128} onSubmitEditing={() => void save()} />
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        {PASSWORD_RULES.map((r) => (
          <Txt key={r.label} variant="caption" tone={r.test(pass) ? 'positive' : 'muted'}>
            {r.test(pass) ? '✓' : '○'} {r.label}
          </Txt>
        ))}
      </View>
      {!!err && (
        <Txt variant="caption" tone="danger">
          {err}
        </Txt>
      )}
      {progress !== null && <ProgressBar progress={progress} height={5} />}
      <Row style={{ gap: 8 }}>
        <Button title="Cancel" variant="ghost" small style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button title="Save" small style={{ flex: 1 }} loading={progress !== null} disabled={!ready} onPress={() => void save()} />
      </Row>
    </Wrap>
  );
}

/** Budgets sealed to a key from before a password reset: open them with the old password, or remove them. */
function LockedBudgets({ count }: { count: number }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const one = count === 1;

  const recover = async () => {
    if (!pass) return;
    setErr(null);
    setProgress(0);
    try {
      const { recovered, needOwner } = await recoverWithOldPassword(pass, setProgress);
      setPass('');
      if (recovered) haptic('success');
      const parts = [recovered ? `Opened ${recovered} budget${recovered === 1 ? '' : 's'}.` : '', needOwner ? `${needOwner} shared budget${needOwner === 1 ? '' : 's'} need${needOwner === 1 ? 's' : ''} a new invite from the owner.` : ''];
      const msg = parts.filter(Boolean).join(' ');
      if (msg) useCloud.setState({ notice: msg });
      else setErr('Not the password these were locked with. Try another.');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card style={{ gap: 10, marginTop: 14 }}>
      <Row style={{ gap: 10 }}>
        <Ionicons name="lock-closed" size={18} color="#E8A019" />
        <Txt variant="strong" style={{ flex: 1 }}>
          {one ? '1 budget is locked' : `${count} budgets are locked`}
        </Txt>
      </Row>
      <Txt variant="caption" tone="soft">
        Saved with your old password. Enter it to open {one ? 'it' : 'them'}.
      </Txt>
      <TextField
        icon="key-outline"
        placeholder="Old password"
        value={pass}
        onChangeText={(t) => {
          setPass(t);
          setErr(null);
        }}
        filter={(t) => t.slice(0, 128)}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        maxLength={128}
        onSubmitEditing={() => void recover()}
      />
      {!!err && (
        <Txt variant="caption" tone="danger">
          {err}
        </Txt>
      )}
      {progress !== null && <ProgressBar progress={progress} height={5} />}
      <Button title={one ? 'Unlock budget' : 'Unlock budgets'} small loading={progress !== null} disabled={!pass} onPress={() => void recover()} />
      <Button
        title="Remove from account"
        variant="ghost"
        small
        onPress={async () => {
          if (!(await confirm('Remove locked budgets', 'Deleted for good. Anyone sharing them keeps their copy.', 'Remove', true))) return;
          try {
            await removeLockedBudgets();
          } catch (e) {
            useCloud.setState({ error: friendlyError(e) });
          }
        }}
      />
    </Card>
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
  const simple = isSimple(useCloud((s) => s.profile));
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
        simple ? 'Simple: your key is kept on your account so you never need a password.' : 'Private: your key backup is locked with your password (scrypt).',
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

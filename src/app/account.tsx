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
import { completeUnlock, deleteAccount, recoverWithOldPassword, resetEncryption, signOutEverywhereOnDevice } from '@/cloud';
import { nativeAppleAvailable, PASSWORD_RULES, sendResetCode, setAccountPassword, signInWithAppleNative, signInWithEmail, signInWithProvider, signUpWithEmail, strongPassword, verifyResetCode } from '@/cloud/auth';
import { friendlyError, useCloud } from '@/cloud/cloudStore';
import { APPLE_SIGN_IN_ENABLED, cloudConfigured } from '@/cloud/config';
import { usePlan } from '@/cloud/pro';
import { pullAll, removeLockedBudgets } from '@/cloud/sync';
import { useStore } from '@/store/store';
import { GRADIENT_SOFT, RADIUS, useTheme } from '@/theme';

export default function AccountScreen() {
  const { status, user, error, notice, syncing, lastSyncAt, locked, settingPassword } = useCloud();
  const sync = useStore((s) => s.sync);
  const budgets = useStore((s) => s.budgets);
  const shared = Object.keys(sync).filter((id) => budgets[id]);
  // Reached as the sign-in gate (not from Settings): no way back, and continue into the app once ready
  // (after choosing a new password, when signing in with a reset code).
  const [asGate, setAsGate] = useState(() => cloudConfigured && useCloud.getState().status !== 'ready');
  // Signed out while on this page (opened from Settings): signing back in should also go home, not stay here.
  if (cloudConfigured && status === 'signedOut' && !asGate) setAsGate(true);
  useEffect(() => {
    if (asGate && status === 'ready' && !settingPassword) router.replace('/');
  }, [asGate, status, settingPassword]);
  // Messages belong to this visit: leaving the page dismisses them.
  useEffect(() => () => useCloud.setState({ notice: null }), []);

  if (status === 'signedOut') return <SignIn />;
  if (settingPassword)
    return (
      <Screen maxWidth={420}>
        <NewPassword />
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
      {status === 'needsUnlock' && <OldPasswordUnlock />}
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
                  {user.email}
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
              Encrypted · Privacy
            </Txt>
          </Tap>
        </View>
      </ScrollView>
    </View>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type EmailStep = 'signin' | 'signup' | 'forgot' | 'code' | 'confirm';

/**
 * Email with a password: sign in, create an account, or (forgot password) get an emailed code that signs you in
 * so you can choose a new password.
 */
function EmailSignIn({ disabled }: { disabled: boolean }) {
  const [step, setStep] = useState<EmailStep>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const go = (next: EmailStep) => {
    setStep(next);
    setErr(null);
    setPassword('');
    setCode('');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const validEmail = () => {
    if (EMAIL_PATTERN.test(email)) return true;
    setErr('Enter a valid email address.');
    return false;
  };

  const submit = () => {
    if (step === 'signin' && validEmail()) void run(() => signInWithEmail(email, password));
    if (step === 'signup' && validEmail()) {
      if (!strongPassword(password)) return setErr('Your password doesn’t meet every rule yet.');
      void run(async () => {
        if (!(await signUpWithEmail(email, password))) go('confirm');
      });
    }
    if (step === 'forgot' && validEmail()) sendCode();
    if (step === 'code')
      void run(async () => {
        // The code signs them in; ask for the new password before the app opens.
        useCloud.setState({ settingPassword: true });
        try {
          await verifyResetCode(email, code);
        } catch (e) {
          useCloud.setState({ settingPassword: false });
          throw e;
        }
      });
  };

  const sendCode = () =>
    void run(async () => {
      await sendResetCode(email);
      setCooldown(60);
      go('code');
    });

  const emailField = (
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
      onSubmitEditing={submit}
    />
  );

  if (step === 'confirm')
    return (
      <Card style={{ gap: 8, alignItems: 'center' }}>
        <Ionicons name="mail-open-outline" size={26} color="#9A5CF5" />
        <Txt variant="strong" center>
          Check your inbox
        </Txt>
        <Txt variant="caption" tone="soft" center>
          Open the link we sent to {email} to finish.
        </Txt>
        <Button title="Back to sign in" variant="ghost" small onPress={() => go('signin')} />
      </Card>
    );

  if (step === 'code')
    return (
      <View style={{ gap: 10 }}>
        <Txt tone="soft" center>
          Code sent to <Txt variant="strong">{email}</Txt>
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
          onSubmitEditing={submit}
        />
        <Button title="Continue" loading={busy} disabled={code.length < 6} onPress={submit} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Button title="Back" variant="ghost" small onPress={() => go('forgot')} />
          <Button title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'} variant="ghost" small disabled={cooldown > 0 || busy} onPress={sendCode} />
        </Row>
      </View>
    );

  if (step === 'forgot')
    return (
      <View style={{ gap: 10 }}>
        <Txt tone="soft" center>
          We’ll email you a code to reset your password.
        </Txt>
        {emailField}
        {!!err && (
          <Txt variant="caption" tone="danger" center>
            {err}
          </Txt>
        )}
        <Button title="Email me a code" loading={busy} disabled={disabled || !email} onPress={submit} />
        <Button title="Back to sign in" variant="ghost" small onPress={() => go('signin')} />
      </View>
    );

  const signup = step === 'signup';
  return (
    <View style={{ gap: 10 }}>
      {emailField}
      <PasswordField value={password} onChange={(t) => (setPassword(t), setErr(null))} isNew={signup} onSubmit={submit} />
      {signup && <PasswordChecklist password={password} />}
      {!!err && (
        <Txt variant="caption" tone="danger" center>
          {err}
        </Txt>
      )}
      <Button title={signup ? 'Create account' : 'Sign in with email'} loading={busy} disabled={disabled || !email || !password} onPress={submit} />
      <Row style={{ justifyContent: signup ? 'center' : 'space-between' }}>
        {!signup && <Button title="Forgot password?" variant="ghost" small onPress={() => go('forgot')} />}
        <Button title={signup ? 'Have an account? Sign in' : 'Create account'} variant="ghost" small onPress={() => go(signup ? 'signin' : 'signup')} />
      </Row>
    </View>
  );
}

/** A password box with a show/hide eye. */
function PasswordField({ value, onChange, isNew, onSubmit, autoFocus }: { value: string; onChange: (t: string) => void; isNew?: boolean; onSubmit?: () => void; autoFocus?: boolean }) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <TextField
      icon="lock-closed-outline"
      placeholder={isNew ? 'Create a password' : 'Password'}
      value={value}
      onChangeText={onChange}
      filter={(t) => t.slice(0, 128)}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={isNew ? 'new-password' : 'current-password'}
      textContentType={isNew ? 'newPassword' : 'password'}
      maxLength={128}
      autoFocus={autoFocus}
      onSubmitEditing={onSubmit}
      right={
        <Tap onPress={() => setShow(!show)} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Tap>
      }
    />
  );
}

/** The password rules, ticking off as they're met. */
function PasswordChecklist({ password }: { password: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, paddingHorizontal: 4 }}>
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <Row key={r.label} style={{ gap: 6 }}>
            <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={ok ? colors.positive : colors.muted} />
            <Txt variant="caption" tone={ok ? 'default' : 'muted'}>
              {r.label}
            </Txt>
          </Row>
        );
      })}
    </View>
  );
}

/** After signing in with a reset code: choose the new password, then into the app. */
function NewPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!strongPassword(password)) return setErr('Your password doesn’t meet every rule yet.');
    setBusy(true);
    setErr(null);
    try {
      await setAccountPassword(password);
      haptic('success');
      useCloud.setState({ settingPassword: false });
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <FormHeader title="Choose a new password" subtitle="Use it next time you sign in with email." />
      <PasswordField value={password} onChange={(t) => (setPassword(t), setErr(null))} isNew autoFocus onSubmit={() => void save()} />
      <PasswordChecklist password={password} />
      {!!err && (
        <Txt variant="caption" tone="danger" center>
          {err}
        </Txt>
      )}
      <Button title="Save password" loading={busy} disabled={!password} onPress={() => void save()} />
    </View>
  );
}

/** Accounts made before Plan dropped encryption passwords: asked once on a new device, then never again. */
function OldPasswordUnlock() {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setErr(null);
    setProgress(0);
    try {
      await completeUnlock(password, setProgress);
      haptic('success');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setProgress(null);
    }
  };

  const startFresh = async () => {
    if (!(await confirm('Start fresh?', 'Budgets that aren’t on this device stay locked until you remember the old password.', 'Start fresh', true))) return;
    setBusy(true);
    try {
      await resetEncryption();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <FormHeader title="One last time" subtitle="Enter your old encryption password. You won’t need it again." />
      <PasswordField value={password} onChange={(t) => (setPassword(t), setErr(null))} autoFocus onSubmit={() => void unlock()} />
      {!!err && (
        <Txt variant="caption" tone="danger" center>
          {err}
        </Txt>
      )}
      {progress !== null && <ProgressBar progress={progress} height={5} />}
      <Button title="Unlock" loading={progress !== null} disabled={!password} onPress={() => void unlock()} />
      <Button title="Forgot it?" variant="ghost" small loading={busy} onPress={() => void startFresh()} />
      <Button title="Use a different account" variant="ghost" small onPress={() => void signOutEverywhereOnDevice()} />
    </View>
  );
}

function FormHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <Image source={require('../../assets/icon.png')} style={{ width: 56, height: 56, borderRadius: 18, marginBottom: 10 }} accessibilityIgnoresInvertColors />
      <Txt variant="h2" center>
        {title}
      </Txt>
      <Txt tone="soft" center>
        {subtitle}
      </Txt>
    </View>
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
  const pro = usePlan((p) => p.plan === 'pro' && p.managed);
  if (!open) return <Button title="Delete account" variant="danger" icon="trash-outline" style={{ marginTop: 10 }} onPress={() => setOpen(true)} />;
  return (
    <Card style={{ marginTop: 10, gap: 10 }}>
      <Txt variant="h3" tone="danger">
        Delete your account
      </Txt>
      <Txt tone="soft">
        Deletes your account and every budget you own, for everyone you shared them with, and clears this device. This can’t be undone.
      </Txt>
      {pro && (
        <Txt tone="soft">
          Your Pro subscription is cancelled too, so you won’t be charged again. Pro stays on until the end of the period you paid for.
        </Txt>
      )}
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
        'Budgets are encrypted (XChaCha20-Poly1305) before they leave this device.',
        'The key is kept with your account, so any device you sign in on can open them.',
        'Each budget has its own key per member. Removing someone rotates it.',
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

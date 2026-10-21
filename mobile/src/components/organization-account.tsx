import { Link, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOutAccount, watchSession } from '@/lib/auth';
import { getFirebaseClients, hasFirebaseConfig } from '@/lib/firebase';
import {
  getOrganizationVerification,
  type AccountSnapshot,
  type ProfileSnapshot,
} from '@/lib/organization-verification';
import { submitProfile } from '@/lib/verification';

const palette = {
  page: '#F4F8F5',
  surface: '#FFFFFF',
  text: '#152A20',
  muted: '#4B6255',
  action: '#167044',
  border: '#C8DAD0',
  green: '#E5F4EB',
  amber: '#FFF4D4',
  amberText: '#704716',
  red: '#FCEBEC',
  redText: '#952D33',
};

const statusContent = {
  pending: {
    title: 'Awaiting verification',
    message:
      'An admin will review your organization profile. You can check their decision here.',
    tone: 'warning',
  },
  approved: {
    title: 'Organization approved',
    message: 'Your organization is verified and eligible to request donations.',
    tone: 'success',
  },
  rejected: {
    title: 'Organization not approved',
    message:
      'Contact the FoodRescue project team for help with your application.',
    tone: 'error',
  },
} as const;

function readableError(error: unknown, fallback: string) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'auth/network-request-failed':
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Check your internet connection, then try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'This email already has an account. Sign in to continue.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password.';
    case 'auth/user-disabled':
      return 'This account is disabled. Contact the FoodRescue project team.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, then try again.';
    case 'permission-denied':
      return 'FoodRescue could not access this profile. Sign in with your organization account.';
    default:
      return fallback;
  }
}

function Message({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning' | 'error' | 'success';
}) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        tone === 'warning' && styles.warning,
        tone === 'error' && styles.error,
        tone === 'success' && styles.success,
      ]}
    >
      {children}
    </Text>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={styles.input}
      />
    </View>
  );
}

function Action({
  children,
  onPress,
  disabled = false,
  secondary = false,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondaryAction,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>
        {children}
      </Text>
    </Pressable>
  );
}

function ProfileForm() {
  const [contactName, setContactName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy || submitted) return;
    if (!contactName.trim() || !organizationName.trim()) {
      setError('Enter a contact name and organization name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitProfile('organization', contactName, organizationName);
      setSubmitted(true);
    } catch (failure) {
      setError(
        readableError(
          failure,
          'Could not submit your profile. Check your connection and try again.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Organization profile
      </Text>
      <Text style={styles.body}>
        Use sample details for the university demo. The names are locked after
        submission.
      </Text>
      <Field
        label="Contact name"
        value={contactName}
        onChangeText={setContactName}
        autoCapitalize="words"
        maxLength={80}
        editable={!busy && !submitted}
      />
      <Field
        label="Organization name"
        value={organizationName}
        onChangeText={setOrganizationName}
        autoCapitalize="words"
        maxLength={120}
        editable={!busy && !submitted}
      />
      {error ? <Message tone="error">{error}</Message> : null}
      {submitted ? (
        <Message tone="success">
          Profile submitted. Checking verification status…
        </Message>
      ) : null}
      <Action onPress={submit} disabled={busy || submitted}>
        {busy ? 'Submitting…' : 'Submit for verification'}
      </Action>
    </View>
  );
}

export function ProfileStatus({ uid }: { uid: string }) {
  const [account, setAccount] = useState<AccountSnapshot>();
  const [profile, setProfile] = useState<ProfileSnapshot>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const { db } = getFirebaseClients();
    const onError = (failure: Error) =>
      setError(
        readableError(failure, 'Could not load your profile. Try again.'),
      );
    const stopAccount = onSnapshot(
      doc(db, 'users', uid),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        setAccount({
          data: snapshot.data() ?? null,
          confirmed: !snapshot.metadata.fromCache,
        });
      },
      onError,
    );
    const stopProfile = onSnapshot(
      doc(db, 'profiles', uid),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;
        setProfile({
          data: snapshot.data() ?? null,
          confirmed: !snapshot.metadata.fromCache,
        });
      },
      onError,
    );
    return () => {
      stopAccount();
      stopProfile();
    };
  }, [attempt, uid]);

  if (error) {
    return (
      <View style={styles.card}>
        <Message tone="error">{error}</Message>
        <Action
          secondary
          onPress={() => {
            setError('');
            setAccount(undefined);
            setProfile(undefined);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Action>
      </View>
    );
  }
  if (!account || !profile) return <Loading label="Checking profile…" />;

  const result = getOrganizationVerification(account, profile);
  if (result.state === 'form') return <ProfileForm />;
  if (result.state === 'waiting') {
    return (
      <Message tone="warning">
        Waiting for the server to confirm your profile. Check your connection if
        this continues.
      </Message>
    );
  }
  if (result.state === 'other-role') {
    return (
      <Message tone="warning">
        This account belongs to a donor. Return home or sign in with an
        organization account.
      </Message>
    );
  }
  if (result.state === 'suspended') {
    return (
      <Message tone="error">
        This account is suspended. Contact the FoodRescue project team.
      </Message>
    );
  }
  if (result.state === 'invalid') {
    return (
      <Message tone="error">
        We could not read an active organization profile for this account.
        Contact the FoodRescue project team.
      </Message>
    );
  }

  const status = statusContent[result.state];
  return (
    <View style={styles.card}>
      <Text style={styles.body}>{result.name}</Text>
      <Text accessibilityRole="header" style={styles.heading}>
        {status.title}
      </Text>
      <Message tone={status.tone}>{status.message}</Message>
      {result.state === 'rejected' && (
        <Text style={styles.body}>
          Rejection reason:{' '}
          {typeof profile.data?.rejectionReason === 'string' &&
          profile.data.rejectionReason
            ? profile.data.rejectionReason
            : 'No reason was recorded for this earlier decision.'}
        </Text>
      )}
      {!result.confirmed ? (
        <Message tone="warning">
          Showing a saved status while we reconnect. It may have changed.
        </Message>
      ) : null}
    </View>
  );
}

function SignedIn({ user }: { user: User }) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError('');
    try {
      await signOutAccount();
    } catch (failure) {
      setError(readableError(failure, 'Could not sign out. Try again.'));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      {user.email ? <Text style={styles.body}>{user.email}</Text> : null}
      <ProfileStatus uid={user.uid} />
      {error ? <Message tone="error">{error}</Message> : null}
      <Action onPress={signOut} disabled={signingOut} secondary>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Action>
    </>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite">
      <ActivityIndicator color={palette.action} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export default function OrganizationScreen() {
  const [user, setUser] = useState<User | null>();
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasFirebaseConfig) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    Promise.resolve()
      .then(() => {
        if (active) unsubscribe = watchSession(setUser);
      })
      .catch((failure: unknown) => {
        if (active) {
          setSessionError(
            readableError(failure, 'Could not load your session. Try again.'),
          );
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [attempt]);

  let content: ReactNode;
  if (!hasFirebaseConfig) {
    content = (
      <Message tone="error">
        Firebase is not configured. Set the client values in the workspace .env
        and restart FoodRescue.
      </Message>
    );
  } else if (sessionError) {
    content = (
      <View style={styles.card}>
        <Message tone="error">{sessionError}</Message>
        <Action
          secondary
          onPress={() => {
            setSessionError('');
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Action>
      </View>
    );
  } else if (user === undefined) {
    content = <Loading label="Restoring your session…" />;
  } else if (user) {
    content = <SignedIn user={user} key={user.uid} />;
  } else {
    content = <Redirect href="/" />;
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.page}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.content}>
            <Link href="/" style={styles.home}>
              ‹ Home
            </Link>
            <View style={styles.intro}>
              <Text style={styles.brand}>FoodRescue</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Organization account
              </Text>
              <Text style={styles.body}>
                Get verified to request free surplus food for your organization.
              </Text>
            </View>
            {content}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.page },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 72 : 16,
    paddingBottom: 32,
  },
  content: { width: '100%', maxWidth: 520, gap: 16 },
  home: {
    color: palette.action,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingEnd: 16,
    fontSize: 15,
    fontWeight: '700',
  },
  intro: { gap: 8, paddingBottom: 4 },
  brand: { color: palette.action, fontSize: 16, fontWeight: '800' },
  title: {
    color: palette.text,
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: -0.65,
  },
  heading: { color: palette.text, fontSize: 21, fontWeight: '700' },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  card: {
    gap: 16,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
  },
  field: { gap: 6 },
  label: { color: palette.text, fontWeight: '600', fontSize: 14 },
  input: {
    color: palette.text,
    backgroundColor: palette.page,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 48,
    fontSize: 16,
  },
  action: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: palette.action,
  },
  secondaryAction: { backgroundColor: palette.green },
  dimmed: { opacity: 0.6 },
  actionText: {
    color: palette.surface,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryText: { color: palette.action },
  notice: {
    color: palette.text,
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  warning: { backgroundColor: palette.amber, color: palette.amberText },
  error: { backgroundColor: palette.red, color: palette.redText },
  success: { backgroundColor: palette.green, color: palette.action },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
});

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
import { PermissionManagerCard } from './permission-manager-card';
import { RecipientFeed } from './recipient-feed';
import { submitProfile } from '@/lib/verification';

const palette = {
  page: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  action: '#167044',
  border: '#E2E8F0',
  green: '#E1F3E8',
  amber: '#FFFBEB',
  amberText: '#B45309',
  red: '#FEF2F2',
  redText: '#B91C1C',
};

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

export function ProfileStatus({ uid, user }: { uid: string; user?: User }) {
  const [account, setAccount] = useState<AccountSnapshot>();
  const [profile, setProfile] = useState<ProfileSnapshot>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [recipientTab, setRecipientTab] = useState<
    'feed' | 'requests' | 'profile'
  >('feed');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutAccount();
    } catch {
      setSignOutError('Could not sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  };

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

  function statusPanel(content: ReactNode) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {content}
        {signOutError ? <Message tone="error">{signOutError}</Message> : null}
        <Action onPress={handleSignOut} disabled={signingOut} secondary>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Action>
      </ScrollView>
    );
  }

  if (error) {
    return statusPanel(
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
      </View>,
    );
  }
  if (!account || !profile)
    return statusPanel(<Loading label="Checking profile…" />);

  const result = getOrganizationVerification(account, profile);
  if (result.state === 'form') return statusPanel(<ProfileForm />);
  if (result.state === 'waiting') {
    return statusPanel(
      <Message tone="warning">
        Waiting for the server to confirm your profile. Check your connection if
        this continues.
      </Message>,
    );
  }
  if (result.state === 'other-role') {
    return statusPanel(
      <Message tone="warning">
        This account belongs to a donor. Return home or sign in with an
        organization account.
      </Message>,
    );
  }
  if (result.state === 'suspended') {
    return statusPanel(
      <Message tone="error">
        This account is suspended. Contact the FoodRescue project team.
      </Message>,
    );
  }
  if (result.state === 'invalid') {
    return statusPanel(
      <Message tone="error">
        We could not read an active organization profile for this account.
        Contact the FoodRescue project team.
      </Message>,
    );
  }

  if (result.state === 'approved') {
    return (
      <View style={styles.appShell}>
        {/* Modern Top App Bar */}
        <View style={styles.appHeader}>
          <View style={styles.appHeaderLeft}>
            <View style={styles.appHeaderLogoBadge}>
              <Text style={{ fontSize: 18 }}>🌱</Text>
            </View>
            <View style={styles.appHeaderTexts}>
              <Text style={styles.appHeaderBrand}>FoodRescue</Text>
              <Text style={styles.appHeaderSub} numberOfLines={1}>
                {result.name}
              </Text>
            </View>
          </View>
          <View style={styles.appHeaderRight}>
            <View style={styles.verifiedPartnerBadge}>
              <Text style={styles.verifiedPartnerText}>
                ✓ Verified Non-Profit
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleSignOut}
              disabled={signingOut}
              style={styles.headerSignOutBtn}
            >
              <Text style={styles.headerSignOutText}>
                {signingOut ? '…' : 'Sign out'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Content Body */}
        <View style={styles.appBody}>
          {!result.confirmed && (
            <Message tone="warning">
              Reconnecting. Showing saved details; donation actions are paused
              until your account is confirmed.
            </Message>
          )}
          {signOutError ? <Message tone="error">{signOutError}</Message> : null}
          {recipientTab === 'feed' && (
            <RecipientFeed
              readOnly={!result.confirmed}
              initialTab="feed"
              key="feed"
            />
          )}
          {recipientTab === 'requests' && (
            <RecipientFeed
              readOnly={!result.confirmed}
              initialTab="requests"
              key="requests"
            />
          )}
          {recipientTab === 'profile' && (
            <ScrollView contentContainerStyle={styles.profileTabContent}>
              <View style={styles.orgProfileCard}>
                <View style={styles.orgProfileIconBox}>
                  <Text style={{ fontSize: 32 }}>🤝</Text>
                </View>
                <Text style={styles.orgProfileName}>{result.name}</Text>
                <View style={styles.verifiedTagRow}>
                  <Text style={styles.verifiedTagText}>
                    ✓ Verified Non-Profit Organization
                  </Text>
                </View>
                <Text style={styles.orgProfileDesc}>
                  Your organization is verified to claim surplus food donations
                  for community food assistance.
                </Text>
                {!!user?.email && (
                  <View style={styles.orgInfoRow}>
                    <Text style={styles.orgInfoLabel}>Signed in account:</Text>
                    <Text style={styles.orgInfoValue}>{user.email}</Text>
                  </View>
                )}
                {signOutError ? (
                  <Message tone="error">{signOutError}</Message>
                ) : null}
                <View style={{ marginTop: 12, width: '100%' }}>
                  <Action
                    onPress={handleSignOut}
                    disabled={signingOut}
                    secondary
                  >
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </Action>
                </View>
              </View>

              <PermissionManagerCard />
            </ScrollView>
          )}
        </View>

        {/* Modern Bottom Navigation Bar */}
        <View style={styles.bottomTabBar}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: recipientTab === 'feed' }}
            onPress={() => setRecipientTab('feed')}
            style={[
              styles.bottomTabItem,
              recipientTab === 'feed' && styles.bottomTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.bottomTabIcon,
                recipientTab === 'feed' && styles.bottomTabIconActive,
              ]}
            >
              🍲
            </Text>
            <Text
              style={[
                styles.bottomTabLabel,
                recipientTab === 'feed' && styles.bottomTabLabelActive,
              ]}
            >
              Browse Food
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: recipientTab === 'requests' }}
            onPress={() => setRecipientTab('requests')}
            style={[
              styles.bottomTabItem,
              recipientTab === 'requests' && styles.bottomTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.bottomTabIcon,
                recipientTab === 'requests' && styles.bottomTabIconActive,
              ]}
            >
              📋
            </Text>
            <Text
              style={[
                styles.bottomTabLabel,
                recipientTab === 'requests' && styles.bottomTabLabelActive,
              ]}
            >
              My Pickups
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: recipientTab === 'profile' }}
            onPress={() => setRecipientTab('profile')}
            style={[
              styles.bottomTabItem,
              recipientTab === 'profile' && styles.bottomTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.bottomTabIcon,
                recipientTab === 'profile' && styles.bottomTabIconActive,
              ]}
            >
              🏢
            </Text>
            <Text
              style={[
                styles.bottomTabLabel,
                recipientTab === 'profile' && styles.bottomTabLabelActive,
              ]}
            >
              Organization
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (result.state === 'pending') {
    return (
      <View style={styles.pendingShell}>
        <View style={styles.pendingCard}>
          <View style={styles.pendingIconBox}>
            <Text style={{ fontSize: 32 }}>⏳</Text>
          </View>
          <Text style={styles.pendingTitle}>Application Under Review</Text>
          <Text style={styles.pendingOrgName}>{result.name}</Text>
          <Text style={styles.pendingDesc}>
            An administrator is reviewing your organization profile. You will be
            able to browse and claim surplus food as soon as verification is
            confirmed.
          </Text>
          {!!user?.email && (
            <Text style={styles.pendingEmail}>Account: {user.email}</Text>
          )}
          <View style={{ marginTop: 16, width: '100%' }}>
            <Action onPress={handleSignOut} disabled={signingOut} secondary>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Action>
          </View>
        </View>
      </View>
    );
  }

  if (result.state === 'rejected') {
    return (
      <View style={styles.pendingShell}>
        <View style={styles.rejectedCard}>
          <View style={styles.rejectedIconBox}>
            <Text style={{ fontSize: 32 }}>⚠️</Text>
          </View>
          <Text style={styles.rejectedTitle}>Organization Not Approved</Text>
          <Text style={styles.pendingOrgName}>{result.name}</Text>
          <Text style={styles.rejectedReason}>
            Rejection reason:{' '}
            {typeof profile.data?.rejectionReason === 'string' &&
            profile.data.rejectionReason
              ? profile.data.rejectionReason
              : 'Contact the FoodRescue project team for guidance on your application.'}
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <Action onPress={handleSignOut} disabled={signingOut} secondary>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Action>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

function SignedIn({ user }: { user: User }) {
  return <ProfileStatus uid={user.uid} user={user} />;
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
    return (
      <SafeAreaView style={styles.appShell}>
        <StatusBar style="dark" />
        <SignedIn user={user} key={user.uid} />
      </SafeAreaView>
    );
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
  appShell: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  appHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  appHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexBasis: 160,
    flexGrow: 1,
    flexShrink: 1,
  },
  appHeaderTexts: {
    flexShrink: 1,
  },
  appHeaderLogoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appHeaderBrand: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  appHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    maxWidth: 140,
  },
  appHeaderRight: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    alignItems: 'center',
    gap: 8,
  },
  verifiedPartnerBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  verifiedPartnerText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerSignOutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerSignOutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  appBody: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  profileTabContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    alignItems: 'center',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  orgProfileCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orgProfileIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#E1F3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgProfileName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  verifiedTagRow: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  verifiedTagText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
  },
  orgProfileDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  orgInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 8,
  },
  orgInfoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  orgInfoValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 8,
  },
  bottomTabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    gap: 3,
  },
  bottomTabItemActive: {
    backgroundColor: '#F0FDF4',
  },
  bottomTabIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  bottomTabIconActive: {
    opacity: 1,
  },
  bottomTabLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  bottomTabLabelActive: {
    color: '#167044',
    fontWeight: '700',
  },
  pendingShell: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  pendingCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#FEF08A',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#CA8A04',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  pendingIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FEF9C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#854D0E',
  },
  pendingOrgName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  pendingDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  pendingEmail: {
    fontSize: 12,
    color: '#94A3B8',
  },
  rejectedCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    gap: 12,
  },
  rejectedIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#B91C1C',
  },
  rejectedReason: {
    fontSize: 14,
    color: '#7F1D1D',
    textAlign: 'center',
    lineHeight: 20,
  },
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
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 16,
    padding: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  field: { gap: 6 },
  label: { color: '#334155', fontWeight: '600', fontSize: 13 },
  input: {
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
  },
  action: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#167044',
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryAction: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  dimmed: { opacity: 0.65 },
  actionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryText: { color: '#334155' },
  notice: {
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
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

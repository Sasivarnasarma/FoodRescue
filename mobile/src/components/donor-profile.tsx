import type { User } from 'firebase/auth';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  AccountButton,
  AccountError,
  AccountField,
  accountErrorMessage,
  donorColors,
} from '@/components/donor-controls';
import type { FoodListing } from '@/lib/listings';
import { DonorIncomingRequests } from '@/components/donor-incoming-requests';
import { DonorListingForm } from '@/components/donor-listing-form';
import { DonorListingsFeed } from '@/components/donor-listings-feed';
import { useDonorProfile } from '@/hooks/use-donor-profile';
import { signOutAccount } from '@/lib/auth';
import { submitProfile } from '@/lib/verification';

const statusCopy = {
  pending: {
    title: 'Pending review',
    description:
      'An admin will review your business profile. Your status updates here when a decision is made.',
  },
  approved: {
    title: 'Approved',
    description: 'Your business profile has been verified.',
  },
  rejected: {
    title: 'Not approved',
    description:
      'Your business profile was rejected. Contact the project admin for help.',
  },
};

export function DonorProfile({ user }: { user: User }) {
  const { account, profile, error, retry } = useDonorProfile(user.uid);
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [busy, setBusy] = useState<'profile' | 'signout' | null>(null);
  const [editing, setEditing] = useState<FoodListing>();
  const [selectedListing, setSelectedListing] = useState<FoodListing>();
  const [notice, setNotice] = useState('');
  const [viewMode, setViewMode] = useState<
    'profile' | 'feed' | 'create' | 'requests'
  >('profile');
  const [message, setMessage] = useState('');

  async function submit() {
    if (!displayName.trim() || !businessName.trim()) {
      setMessage('Enter a display name and a business name.');
      return;
    }
    setBusy('profile');
    setMessage('');
    try {
      await submitProfile('provider', displayName, businessName);
    } catch (submitError) {
      setMessage(
        accountErrorMessage(
          submitError,
          'Unable to submit your profile. Try again.',
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('signout');
    setMessage('');
    try {
      await signOutAccount();
    } catch (signOutError) {
      setMessage(
        accountErrorMessage(signOutError, 'Unable to sign out. Try again.'),
      );
    } finally {
      setBusy(null);
    }
  }

  const fromCache = account?.fromCache || profile?.fromCache;

  function renderProfile() {
    if (error) {
      return (
        <>
          <AccountError
            message={accountErrorMessage(
              error,
              'Unable to load your donor profile.',
            )}
          />
          <AccountButton label="Retry profile load" onPress={retry} secondary />
        </>
      );
    }
    if (!account || !profile) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator color={donorColors.green} />
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Loading your profile…
          </Text>
        </View>
      );
    }
    if (account.data?.role === 'organization') {
      return (
        <Text style={styles.body}>
          This account belongs to a recipient organization. Use the organization
          screen to manage its profile.
        </Text>
      );
    }
    if (
      account.data &&
      (account.data.role !== 'provider' ||
        account.data.accountStatus !== 'active')
    ) {
      return (
        <AccountError message="This account cannot submit a donor profile. Contact the project admin for help." />
      );
    }
    if (!profile.data) {
      if (fromCache) {
        return (
          <Text style={styles.body}>
            Connect to the internet to check whether you already have a profile.
          </Text>
        );
      }
      return (
        <>
          <Text accessibilityRole="header" style={styles.title}>
            Set up your business profile
          </Text>
          <Text style={styles.body}>
            Submit your details for verification before you can donate.
          </Text>
          <AccountField
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={80}
            autoComplete="name"
            editable={!busy}
          />
          <AccountField
            label="Business name"
            value={businessName}
            onChangeText={setBusinessName}
            maxLength={120}
            autoComplete="organization"
            editable={!busy}
          />
          <AccountButton
            label={busy === 'profile' ? 'Submitting…' : 'Submit for review'}
            disabled={!!busy}
            onPress={submit}
          />
        </>
      );
    }
    const status: unknown = profile.data.verificationStatus;
    if (
      !account.data ||
      profile.data.type !== 'provider' ||
      (status !== 'pending' && status !== 'approved' && status !== 'rejected')
    ) {
      return (
        <AccountError message="Your verification details are unavailable. Contact the project admin for help." />
      );
    }
    return (
      <View style={styles.statusPanel}>
        <Text style={styles.business}>{profile.data.name}</Text>
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="header"
          style={[
            styles.title,
            status === 'rejected' && styles.rejected,
            status === 'pending' && styles.pending,
          ]}
        >
          {statusCopy[status].title}
        </Text>
        <Text style={styles.body}>{statusCopy[status].description}</Text>
        {status === 'approved' && (
          <View style={{ marginTop: 14, gap: 8 }}>
            <AccountButton
              label="+ Post New Food Donation"
              onPress={() => {
                setEditing(undefined);
                setViewMode('create');
              }}
            />
            <AccountButton
              label="View & Manage Donations"
              onPress={() => setViewMode('feed')}
              secondary
            />
          </View>
        )}
        {status === 'rejected' && (
          <Text style={styles.body}>
            <Text style={{ fontWeight: 'bold' }}>Rejection reason: </Text>
            {profile.data.rejectionReason ||
              'No reason was recorded for this earlier decision.'}
          </Text>
        )}
      </View>
    );
  }

  const canManage =
    !error &&
    account?.data?.accountStatus === 'active' &&
    profile?.data?.verificationStatus === 'approved' &&
    !fromCache;
  if (canManage && viewMode === 'create') {
    return (
      <DonorListingForm
        key={editing?.id ?? 'new'}
        initialListing={editing}
        onSuccess={() => {
          setNotice('Donation saved successfully.');
          setViewMode('feed');
        }}
        onCancel={() => setViewMode('profile')}
      />
    );
  }

  if (canManage && viewMode === 'requests' && selectedListing) {
    return (
      <View style={{ flex: 1, minHeight: 450 }}>
        <DonorIncomingRequests
          listing={selectedListing}
          onBack={() => setViewMode('feed')}
        />
      </View>
    );
  }

  if (canManage && viewMode === 'feed') {
    return (
      <View style={{ flex: 1, minHeight: 450 }}>
        {notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
        <DonorListingsFeed
          onCreatePress={() => {
            setEditing(undefined);
            setViewMode('create');
          }}
          onEditDraft={(listing) => {
            setEditing(listing);
            setViewMode('create');
          }}
          onViewRequests={(listing) => {
            setSelectedListing(listing);
            setViewMode('requests');
          }}
        />
        <View style={{ padding: 16 }}>
          <AccountButton
            label="Back to Profile"
            onPress={() => setViewMode('profile')}
            secondary
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {!!user.email && (
        <Text style={styles.body}>Signed in as {user.email}</Text>
      )}
      {!!fromCache && !error && (
        <Text accessibilityLiveRegion="polite" style={styles.pending}>
          Waiting for the server. Saved information may be out of date.
        </Text>
      )}
      {renderProfile()}
      {!!message && <AccountError message={message} />}
      <AccountButton
        label={busy === 'signout' ? 'Signing out…' : 'Sign out'}
        disabled={!!busy}
        onPress={signOut}
        secondary
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: donorColors.green, fontSize: 22, fontWeight: '700' },
  body: { color: donorColors.secondary, fontSize: 15, lineHeight: 22 },
  business: { color: donorColors.text, fontSize: 16, fontWeight: '600' },
  pending: { color: donorColors.amber },
  rejected: { color: donorColors.danger },
  statusPanel: {
    backgroundColor: donorColors.background,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
});

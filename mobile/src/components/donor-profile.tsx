import type { User } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
import { DonorPickupScanner } from '@/components/donor-pickup-scanner';
import { DonorPickupScreen } from '@/components/donor-pickup-screen';
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
  const [scannerVisible, setScannerVisible] = useState(false);
  const [viewMode, setViewMode] = useState<
    'profile' | 'feed' | 'create' | 'requests' | 'pickup'
  >('feed');
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
        {status === 'approved' && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ Verified Donor Partner</Text>
          </View>
        )}
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
          <View style={{ marginTop: 14, gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditing(undefined);
                setViewMode('create');
              }}
              style={({ pressed }) => [
                styles.heroActionCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.heroActionIcon}>
                <Text style={{ fontSize: 20, color: '#FFFFFF' }}>➕</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.heroActionTitle}>
                  Post New Food Donation
                </Text>
                <Text style={styles.heroActionDesc}>
                  List surplus food for verified charities in under 2 minutes
                </Text>
              </View>
            </Pressable>

            <View style={styles.actionGrid}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setViewMode('feed')}
                style={({ pressed }) => [
                  styles.tileActionCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <Text style={{ fontSize: 22, marginBottom: 4 }}>📋</Text>
                <Text style={styles.tileTitle}>Manage Listings</Text>
                <Text style={styles.tileDesc}>
                  Active food & incoming requests
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setScannerVisible(true)}
                style={({ pressed }) => [
                  styles.tileActionCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <Text style={{ fontSize: 22, marginBottom: 4 }}>📷</Text>
                <Text style={styles.tileTitle}>Scan Pickup QR</Text>
                <Text style={styles.tileDesc}>
                  Verify handover with recipient
                </Text>
              </Pressable>
            </View>
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
    profile?.data?.verificationStatus === 'approved';

  if (canManage && profile?.data) {
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
                {profile.data.name}
              </Text>
            </View>
          </View>
          <View style={styles.appHeaderRight}>
            <View style={styles.verifiedPartnerBadge}>
              <Text style={styles.verifiedPartnerText}>✓ Verified Donor</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={signOut}
              disabled={!!busy}
              style={styles.headerSignOutBtn}
            >
              <Text style={styles.headerSignOutText}>
                {busy === 'signout' ? '…' : 'Sign out'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Content Body */}
        <View style={styles.appBody}>
          {!!fromCache && (
            <Text accessibilityLiveRegion="polite" style={styles.noticeBanner}>
              Reconnecting. Your form stays open; saving and donation actions
              are paused until your account is confirmed.
            </Text>
          )}
          {!!message && <AccountError message={message} />}
          {!!notice && (
            <Text accessibilityLiveRegion="polite" style={styles.noticeBanner}>
              {notice}
            </Text>
          )}

          {viewMode === 'create' && (
            <DonorListingForm
              readOnly={!!fromCache}
              key={editing?.id ?? 'new'}
              initialListing={editing}
              onSuccess={() => {
                setNotice('Donation saved successfully.');
                setViewMode('feed');
              }}
              onCancel={() => setViewMode('feed')}
            />
          )}

          {viewMode === 'requests' && selectedListing && (
            <DonorIncomingRequests
              readOnly={!!fromCache}
              listing={selectedListing}
              onBack={() => setViewMode('feed')}
            />
          )}

          {viewMode === 'pickup' && selectedListing && (
            <DonorPickupScreen
              readOnly={!!fromCache}
              key={selectedListing.id}
              listing={selectedListing}
              onBack={() => setViewMode('feed')}
            />
          )}

          {viewMode === 'feed' && (
            <DonorListingsFeed
              readOnly={!!fromCache}
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
              onOpenPickup={(listing) => {
                setSelectedListing(listing);
                setViewMode('pickup');
              }}
              onScanPress={() => setScannerVisible(true)}
            />
          )}

          {viewMode === 'profile' && (
            <ScrollView contentContainerStyle={styles.profileTabContent}>
              <View style={styles.businessProfileCard}>
                <View style={styles.businessIconBox}>
                  <Text style={{ fontSize: 32 }}>🏪</Text>
                </View>
                <Text style={styles.businessProfileName}>
                  {profile.data.name}
                </Text>
                <View style={styles.verifiedTagRow}>
                  <Text style={styles.verifiedTagText}>
                    ✓ Verified Food Provider Partner
                  </Text>
                </View>
                <Text style={styles.businessProfileDesc}>
                  Your business is verified to post edible surplus food for
                  community pickup by certified non-profits.
                </Text>
                {!!user.email && (
                  <View style={styles.businessInfoRow}>
                    <Text style={styles.businessInfoLabel}>Signed in as:</Text>
                    <Text style={styles.businessInfoValue}>{user.email}</Text>
                  </View>
                )}
                {!!message && <AccountError message={message} />}
                <View style={{ marginTop: 16, width: '100%' }}>
                  <AccountButton
                    label={busy === 'signout' ? 'Signing out…' : 'Sign out'}
                    disabled={!!busy}
                    onPress={signOut}
                    secondary
                  />
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Bottom Navigation Bar */}
        <View style={styles.bottomTabBar}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{
              selected: viewMode === 'feed' || viewMode === 'requests',
            }}
            onPress={() => setViewMode('feed')}
            style={[
              styles.bottomTabItem,
              (viewMode === 'feed' || viewMode === 'requests') &&
                styles.bottomTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.bottomTabIcon,
                (viewMode === 'feed' || viewMode === 'requests') &&
                  styles.bottomTabIconActive,
              ]}
            >
              📦
            </Text>
            <Text
              style={[
                styles.bottomTabLabel,
                (viewMode === 'feed' || viewMode === 'requests') &&
                  styles.bottomTabLabelActive,
              ]}
            >
              Listings
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'create' }}
            onPress={() => {
              setEditing(undefined);
              setViewMode('create');
            }}
            style={[
              styles.bottomTabItem,
              viewMode === 'create' && styles.bottomTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.bottomTabIcon,
                viewMode === 'create' && styles.bottomTabIconActive,
              ]}
            >
              ➕
            </Text>
            <Text
              style={[
                styles.bottomTabLabel,
                viewMode === 'create' && styles.bottomTabLabelActive,
              ]}
            >
              Post Food
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{
              selected: viewMode === 'pickup' || scannerVisible,
            }}
            onPress={() => setScannerVisible(true)}
            style={[
              styles.bottomTabItem,
              (viewMode === 'pickup' || scannerVisible) &&
                styles.bottomTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.bottomTabIcon,
                (viewMode === 'pickup' || scannerVisible) &&
                  styles.bottomTabIconActive,
              ]}
            >
              📷
            </Text>
            <Text
              style={[
                styles.bottomTabLabel,
                (viewMode === 'pickup' || scannerVisible) &&
                  styles.bottomTabLabelActive,
              ]}
            >
              Handover
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'profile' }}
            onPress={() => setViewMode('profile')}
            style={[
              styles.bottomTabItem,
              viewMode === 'profile' && styles.bottomTabItemActive,
            ]}
          >
            <Text
              style={[
                styles.bottomTabIcon,
                viewMode === 'profile' && styles.bottomTabIconActive,
              ]}
            >
              🏪
            </Text>
            <Text
              style={[
                styles.bottomTabLabel,
                viewMode === 'profile' && styles.bottomTabLabelActive,
              ]}
            >
              Business
            </Text>
          </Pressable>
        </View>

        <DonorPickupScanner
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onSelectListing={(listing) => {
            setSelectedListing(listing);
            setViewMode('pickup');
          }}
        />
      </View>
    );
  }

  if (profile?.data && profile.data.verificationStatus === 'pending') {
    return (
      <View style={styles.pendingShell}>
        <View style={styles.pendingCard}>
          <View style={styles.pendingIconBox}>
            <Text style={{ fontSize: 32 }}>⏳</Text>
          </View>
          <Text style={styles.pendingTitle}>Application Under Review</Text>
          <Text style={styles.pendingBusinessName}>{profile.data.name}</Text>
          <Text style={styles.pendingDesc}>
            Your business profile has been submitted and is currently being
            reviewed by FoodRescue administrators. You will be able to post
            surplus food once approved.
          </Text>
          {!!user.email && (
            <Text style={styles.pendingEmail}>Account: {user.email}</Text>
          )}
          <View style={{ marginTop: 16, width: '100%' }}>
            <AccountButton
              label={busy === 'signout' ? 'Signing out…' : 'Sign out'}
              disabled={!!busy}
              onPress={signOut}
              secondary
            />
          </View>
        </View>
      </View>
    );
  }

  if (profile?.data && profile.data.verificationStatus === 'rejected') {
    return (
      <View style={styles.pendingShell}>
        <View style={styles.rejectedCard}>
          <View style={styles.rejectedIconBox}>
            <Text style={{ fontSize: 32 }}>⚠️</Text>
          </View>
          <Text style={styles.rejectedTitle}>Verification Not Approved</Text>
          <Text style={styles.pendingBusinessName}>{profile.data.name}</Text>
          <Text style={styles.rejectedReason}>
            Rejection reason:{' '}
            {profile.data.rejectionReason ||
              'Contact the FoodRescue project team for guidance on your application.'}
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <AccountButton
              label={busy === 'signout' ? 'Signing out…' : 'Sign out'}
              disabled={!!busy}
              onPress={signOut}
              secondary
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.formScroll}>
      <View style={styles.formContainer}>
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
    </ScrollView>
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
  },
  noticeBanner: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
    padding: 10,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
  },
  profileTabContent: {
    padding: 20,
    alignItems: 'center',
  },
  businessProfileCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    gap: 12,
  },
  businessIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#E1F3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessProfileName: {
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
  businessProfileDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  businessInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 8,
  },
  businessInfoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  businessInfoValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 6,
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
  pendingBusinessName: {
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
  formScroll: {
    padding: 20,
    alignItems: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 440,
    gap: 14,
  },
  form: { gap: 14 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#0F172A', fontSize: 20, fontWeight: '700' },
  body: { color: donorColors.secondary, fontSize: 14, lineHeight: 21 },
  business: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  pending: { color: donorColors.amber },
  rejected: { color: donorColors.danger },
  statusPanel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 18,
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 4,
  },
  verifiedText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  heroActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#167044',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  heroActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  heroActionDesc: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    lineHeight: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  tileActionCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  tileDesc: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 15,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

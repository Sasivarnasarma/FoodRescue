import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCurrentTime } from '../hooks/use-current-time';
import { getFirebaseClients } from '../lib/firebase';
import {
  subscribeToListing,
  type FoodListing,
  type ListingPage,
  type ListingPageOptions,
} from '../lib/listings';
import {
  subscribeToOrganizationRequests,
  withdrawDonationRequest,
  type DonationRequest,
} from '../lib/requests';
import { deriveRequestState, formatDateText } from '../lib/request-validation';

interface OrganizationRequestsViewProps {
  onSelectListing: (listingId: string) => void;
  onBrowseListings: () => void;
}

const colors = {
  green: '#167044',
  greenBg: '#E5F4EB',
  greenText: '#0E482C',
  greenBorder: '#99D5B3',
  amber: '#704716',
  amberBg: '#FFF4D4',
  amberBorder: '#E0C875',
  red: '#952D33',
  redBg: '#FCEBEC',
  redBorder: '#E4A4A8',
  blue: '#0369A1',
  blueBg: '#E0F2FE',
  blueBorder: '#BAE6FD',
  neutralText: '#334155',
  neutralBg: '#F1F5F9',
  neutralBorder: '#CBD5E1',
  text: '#152A20',
  secondary: '#4B6255',
  surface: '#FFFFFF',
  border: '#C8DAD0',
  background: '#F4F8F5',
};

export function OrganizationRequestsView({
  onSelectListing,
  onBrowseListings,
}: OrganizationRequestsViewProps) {
  const { auth } = getFirebaseClients();
  const currentUid = auth.currentUser?.uid;

  const now = useCurrentTime();
  const [cursors, setCursors] = useState<ListingPageOptions[]>([{}]);
  const options = cursors[cursors.length - 1];
  const [parentConfirmed, setParentConfirmed] = useState<
    Record<string, boolean>
  >({});
  const [parentErrors, setParentErrors] = useState<Record<string, string>>({});
  const [requests, setRequests] = useState<DonationRequest[]>([]);
  const [page, setPage] = useState<ListingPage>();
  const [loading, setLoading] = useState(() => Boolean(currentUid));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [listingsMap, setListingsMap] = useState<Record<string, FoodListing>>(
    {},
  );
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  // Observe parent states too: approving a different organization does not write this request.
  useEffect(() => {
    if (!currentUid) return;
    let active = true;
    let stop: (() => void) | undefined;
    const parents = new Map<string, () => void>();
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setLoading(true);
        setError('');
        stop = subscribeToOrganizationRequests(
          currentUid,
          (items, metadata) => {
            if (!active) return;
            setRequests(items);
            setPage(metadata);
            setLoading(false);
            setError('');
            const ids = new Set(items.map((item) => item.listingId));
            for (const [id, unsubscribe] of parents) {
              if (!ids.has(id)) {
                unsubscribe();
                parents.delete(id);
              }
            }
            for (const id of ids) {
              if (parents.has(id)) continue;
              parents.set(
                id,
                subscribeToListing(
                  id,
                  (listing, meta) => {
                    if (!active) return;
                    if (listing)
                      setListingsMap((prev) => ({ ...prev, [id]: listing }));
                    setParentConfirmed((prev) => ({
                      ...prev,
                      [id]:
                        !!listing && !meta.fromCache && !meta.hasPendingWrites,
                    }));
                    setParentErrors((prev) => ({
                      ...prev,
                      [id]: listing ? '' : 'Donation details unavailable.',
                    }));
                  },
                  () => {
                    if (!active) return;
                    setParentConfirmed((prev) => ({ ...prev, [id]: false }));
                    setParentErrors((prev) => ({
                      ...prev,
                      [id]: 'Donation details unavailable. Reconnect or refresh.',
                    }));
                  },
                ),
              );
            }
          },
          (cause) => {
            if (!active) return;
            setError(cause.message || 'Could not load your requests. Retry.');
            setLoading(false);
          },
          options,
        );
      })
      .catch(() => {
        if (active) {
          setError('Could not load your requests. Retry.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
      stop?.();
      for (const unsubscribe of parents.values()) unsubscribe();
    };
  }, [currentUid, attempt, options]);
  const handleWithdraw = (listingId: string) => {
    if (
      !currentUid ||
      page?.fromCache ||
      page?.hasPendingWrites ||
      !parentConfirmed[listingId] ||
      withdrawingId
    )
      return;

    Alert.alert(
      'Withdraw Request?',
      'Are you sure you want to withdraw your request? You cannot resubmit a request for this listing once withdrawn.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setWithdrawingId(listingId);
            try {
              await withdrawDonationRequest(listingId, currentUid);
            } catch (err: unknown) {
              Alert.alert(
                'Withdrawal Error',
                err instanceof Error
                  ? err.message
                  : 'Could not withdraw request.',
              );
            } finally {
              setWithdrawingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.green} />
        <Text style={styles.centerText}>Loading your requests…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Unable to load requests</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.retryButton}
          onPress={() => setAttempt((a) => a + 1)}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (requests.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No requests on this page</Text>
        <Pressable accessibilityRole="button" onPress={() => setCursors([{}])}>
          <Text>Return to first page</Text>
        </Pressable>
        <Text style={styles.emptyText}>
          Your organization has not submitted any donation requests. Browse
          nearby surplus donations to request whole listings for pickup.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.browseButton}
          onPress={onBrowseListings}
        >
          <Text style={styles.browseButtonText}>Browse Nearby Donations</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {page?.fromCache && (
        <View style={styles.cachedBanner}>
          <Text style={styles.cachedText}>
            Showing saved requests offline. Reconnecting…
          </Text>
        </View>
      )}

      <View style={styles.listContent}>
        {requests.map((item) => {
          const listing = listingsMap[item.listingId];
          const derived = deriveRequestState(
            item,
            listing ?? null,
            currentUid ?? '',
            now,
          );

          let badgeBg = colors.neutralBg;
          let badgeText = colors.neutralText;
          let borderColor = colors.neutralBorder;

          if (derived.tone === 'success') {
            badgeBg = colors.greenBg;
            badgeText = colors.greenText;
            borderColor = colors.greenBorder;
          } else if (derived.tone === 'warning') {
            badgeBg = colors.amberBg;
            badgeText = colors.amber;
            borderColor = colors.amberBorder;
          } else if (derived.tone === 'error') {
            badgeBg = colors.redBg;
            badgeText = colors.red;
            borderColor = colors.redBorder;
          } else if (derived.tone === 'info') {
            badgeBg = colors.blueBg;
            badgeText = colors.blue;
            borderColor = colors.blueBorder;
          }

          return (
            <Pressable
              key={`${item.listingId}_${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Request for ${listing?.title || 'Donation'}, status: ${derived.label}`}
              style={({ pressed }) => [
                styles.requestCard,
                { borderColor },
                pressed && styles.cardPressed,
              ]}
              onPress={() => onSelectListing(item.listingId)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.titleColumn}>
                  <Text style={styles.listingTitle}>
                    {parentErrors[item.listingId] ||
                      (listing ? listing.title : 'Loading donation details…')}
                  </Text>
                  {listing && (
                    <Text style={styles.listingProvider}>
                      {listing.providerName} • {listing.quantity} {listing.unit}
                    </Text>
                  )}
                </View>
                <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.badgeLabel, { color: badgeText }]}>
                    {derived.label}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDetails}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Proposed Pickup:</Text>
                  <Text style={styles.infoValue}>
                    {formatDateText(item.plannedPickupAt)}
                  </Text>
                </View>
                {listing && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Pickup Window:</Text>
                    <Text style={styles.infoValue}>
                      {formatDateText(listing.pickupStartsAt)} –{' '}
                      {formatDateText(listing.pickupDeadline)}
                    </Text>
                  </View>
                )}
                {item.createdAt && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Requested On:</Text>
                    <Text style={styles.infoValue}>
                      {formatDateText(item.createdAt)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action buttons inside card */}
              <View style={styles.cardFooter}>
                <Text style={styles.viewDetailLink}>
                  View Donation Details →
                </Text>
                {derived.canWithdraw && (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.withdrawAction}
                    onPress={(event) => {
                      event.stopPropagation();
                      handleWithdraw(item.listingId);
                    }}
                    disabled={
                      !!withdrawingId ||
                      page?.fromCache ||
                      page?.hasPendingWrites ||
                      !parentConfirmed[item.listingId]
                    }
                  >
                    {withdrawingId === item.listingId ? (
                      <ActivityIndicator size="small" color={colors.red} />
                    ) : (
                      <Text style={styles.withdrawActionText}>Withdraw</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, padding: 12 }}>
        <Pressable
          accessibilityRole="button"
          disabled={cursors.length === 1}
          onPress={() => setCursors((v) => v.slice(0, -1))}
        >
          <Text>Previous</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setAttempt((v) => v + 1)}
        >
          <Text>Refresh</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={
            !page?.nextCursor || page.fromCache || page.hasPendingWrites
          }
          onPress={() => {
            if (page?.nextCursor)
              setCursors((v) => [...v, { after: page.nextCursor! }]);
          }}
        >
          <Text>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  centerContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  centerText: {
    color: colors.secondary,
    fontSize: 14,
  },
  errorContainer: {
    padding: 24,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.redBorder,
    alignItems: 'center',
    gap: 8,
    margin: 16,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.red,
  },
  errorText: {
    fontSize: 14,
    color: colors.secondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: colors.green,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 32,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12,
    margin: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  browseButton: {
    marginTop: 6,
    backgroundColor: colors.green,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  cachedBanner: {
    backgroundColor: colors.amberBg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.amberBorder,
  },
  cachedText: {
    fontSize: 12,
    color: colors.amber,
    fontWeight: '600',
    textAlign: 'center',
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleColumn: {
    flex: 1,
    gap: 2,
  },
  listingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  listingProvider: {
    fontSize: 13,
    color: colors.secondary,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: colors.secondary,
  },
  infoValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  viewDetailLink: {
    fontSize: 13,
    color: colors.green,
    fontWeight: '700',
  },
  withdrawAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.redBg,
    borderColor: colors.redBorder,
    borderWidth: 1,
  },
  withdrawActionText: {
    fontSize: 12,
    color: colors.red,
    fontWeight: '700',
  },
});

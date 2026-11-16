import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
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
} from '../lib/listings';
import {
  subscribeToOrganizationRequests,
  withdrawDonationRequest,
  type DonationRequest,
} from '../lib/requests';
import {
  deriveRequestState,
  formatDateText,
  isRecipientAssignment,
  isRecipientCollection,
} from '../lib/request-validation';

interface OrganizationRequestsViewProps {
  readOnly?: boolean;
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
  readOnly = false,
  onSelectListing,
  onBrowseListings,
}: OrganizationRequestsViewProps) {
  const { auth } = getFirebaseClients();
  const currentUid = auth.currentUser?.uid;

  const now = useCurrentTime();
  const INITIAL_LIMIT = 10;
  const [displayLimit, setDisplayLimit] = useState(INITIAL_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
  const [filterTab, setFilterTab] = useState<
    'all' | 'pickups' | 'pending' | 'collected'
  >('all');

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
            setLoadingMore(false);
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
            setLoadingMore(false);
          },
          { limit: displayLimit },
        );
      })
      .catch(() => {
        if (active) {
          setError('Could not load your requests. Retry.');
          setLoading(false);
          setLoadingMore(false);
        }
      });
    return () => {
      active = false;
      stop?.();
      for (const unsubscribe of parents.values()) unsubscribe();
    };
  }, [currentUid, attempt, displayLimit]);

  const handleLoadMore = () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setDisplayLimit((prev) => prev + 10);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setDisplayLimit(INITIAL_LIMIT);
    setAttempt((v) => v + 1);
    setTimeout(() => setRefreshing(false), 500);
  };

  const hasMore =
    page?.nextCursor !== null || requests.length >= displayLimit;
  const handleWithdraw = (listingId: string) => {
    if (
      !currentUid ||
      readOnly ||
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
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>No Requests Yet</Text>
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

  const isRequestPickup = (item: DonationRequest) => {
    const listing = listingsMap[item.listingId];
    return (
      isRecipientAssignment(listing, item, currentUid ?? '') &&
      !!listing.pickupDeadline &&
      listing.pickupDeadline.getTime() > now.getTime()
    );
  };
  const isRequestCollected = (item: DonationRequest) =>
    isRecipientCollection(listingsMap[item.listingId], item, currentUid ?? '');
  const isRequestPending = (item: DonationRequest) =>
    deriveRequestState(
      item,
      listingsMap[item.listingId] ?? null,
      currentUid ?? '',
      now,
    ).status === 'pending';
  const pickupsCount = requests.filter(isRequestPickup).length;
  const pendingCount = requests.filter(isRequestPending).length;
  const collectedCount = requests.filter(isRequestCollected).length;

  const filteredRequests = requests.filter((item) => {
    if (filterTab === 'pickups') return isRequestPickup(item);
    if (filterTab === 'pending') return isRequestPending(item);
    if (filterTab === 'collected') return isRequestCollected(item);
    return true;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled={true}
      showsVerticalScrollIndicator={true}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.green]}
          tintColor={colors.green}
        />
      }
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const isCloseToBottom =
          layoutMeasurement.height + contentOffset.y >=
          contentSize.height - 150;
        if (isCloseToBottom && hasMore && !loadingMore && !loading && !error) {
          handleLoadMore();
        }
      }}
      scrollEventThrottle={100}
    >
      {page?.fromCache && (
        <View style={styles.cachedBanner}>
          <Text style={styles.cachedText}>
            Showing saved requests offline. Reconnecting…
          </Text>
        </View>
      )}
      {/* Filter Tabs / Segmented Pills */}
      <View style={styles.filterBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
        >
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: filterTab === 'all' }}
            style={[
              styles.filterTab,
              filterTab === 'all' && styles.filterTabActive,
            ]}
            onPress={() => setFilterTab('all')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterTab === 'all' && styles.filterTabTextActive,
              ]}
            >
              All ({requests.length})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: filterTab === 'pickups' }}
            style={[
              styles.filterTab,
              filterTab === 'pickups' && styles.filterTabActive,
            ]}
            onPress={() => setFilterTab('pickups')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterTab === 'pickups' && styles.filterTabTextActive,
              ]}
            >
              Active Pickups ({pickupsCount})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: filterTab === 'pending' }}
            style={[
              styles.filterTab,
              filterTab === 'pending' && styles.filterTabActive,
            ]}
            onPress={() => setFilterTab('pending')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterTab === 'pending' && styles.filterTabTextActive,
              ]}
            >
              Pending ({pendingCount})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: filterTab === 'collected' }}
            style={[
              styles.filterTab,
              filterTab === 'collected' && styles.filterTabActive,
            ]}
            onPress={() => setFilterTab('collected')}
          >
            <Text
              style={[
                styles.filterTabText,
                filterTab === 'collected' && styles.filterTabTextActive,
              ]}
            >
              Collection History ({collectedCount})
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {filteredRequests.length === 0 ? (
        <View style={styles.emptyFilterContainer}>
          <Text style={styles.emptyFilterTitle}>
            {filterTab === 'pickups'
              ? 'No Active Pickups'
              : filterTab === 'collected'
                ? 'No Collection History Yet'
                : filterTab === 'pending'
                  ? 'No Pending Requests'
                  : 'No Requests Found'}
          </Text>
          <Text style={styles.emptyFilterText}>
            {filterTab === 'pickups'
              ? 'When a donor approves your request, your pickup screen with the QR reference code and handover confirmation will appear here.'
              : filterTab === 'collected'
                ? 'Completed collections with donors will appear here with handover timestamps and receipts.'
                : filterTab === 'pending'
                  ? 'You have no requests currently awaiting donor review.'
                  : 'No requests match the selected filter.'}
          </Text>
          {filterTab !== 'all' && (
            <Pressable
              accessibilityRole="button"
              style={styles.resetFilterButton}
              onPress={() => setFilterTab('all')}
            >
              <Text style={styles.resetFilterButtonText}>
                Show All Requests
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.listContent}>
          {filteredRequests.map((item) => {
            const listing = listingsMap[item.listingId];
            const derived = deriveRequestState(
              item,
              listing ?? null,
              currentUid ?? '',
              now,
            );
            const isApproved = isRequestPickup(item);
            const isCollected = isRequestCollected(item);

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
                        {listing.providerName} • {listing.quantity}{' '}
                        {listing.unit}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.badgeLabel, { color: badgeText }]}>
                      {derived.label}
                    </Text>
                  </View>
                </View>

                {isApproved && (
                  <View style={styles.pickupCallout}>
                    <Text style={styles.pickupCalloutText}>
                      ✓ Approved — Tap to open QR reference & confirm handover
                    </Text>
                  </View>
                )}
                {isCollected && (
                  <View style={styles.collectedCallout}>
                    <Text style={styles.collectedCalloutText}>
                      ✓ Collected — Tap to view collection receipt
                    </Text>
                  </View>
                )}

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
                    {isApproved
                      ? 'Open Pickup & QR Reference →'
                      : isCollected
                        ? 'View Handover Receipt →'
                        : 'View Donation Details →'}
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
                        readOnly ||
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
      )}
      {/* Infinite Scroll Footer */}
      <View style={styles.infiniteScrollFooter}>
        {loadingMore ? (
          <View style={styles.loadingMoreRow}>
            <ActivityIndicator size="small" color={colors.green} />
            <Text style={styles.loadingMoreText}>
              Loading more requests…
            </Text>
          </View>
        ) : hasMore && requests.length >= displayLimit ? (
          <Pressable
            accessibilityRole="button"
            style={styles.loadMoreButton}
            onPress={handleLoadMore}
          >
            <Text style={styles.loadMoreButtonText}>
              Scroll or tap to load more
            </Text>
          </Pressable>
        ) : requests.length > 0 ? (
          <View style={styles.endOfFeedRow}>
            <Text style={styles.endOfFeedText}>
              ✨ All caught up ({filteredRequests.length}{' '}
              {filteredRequests.length === 1 ? 'request' : 'requests'} displayed)
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  scrollContent: {
    paddingBottom: 120,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
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
  emptyIcon: {
    fontSize: 36,
    marginBottom: 4,
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
    flexWrap: 'wrap',
    gap: 8,
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
  filterBarContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
  },
  filterBar: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterTabActive: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
  },
  filterTabTextActive: {
    color: colors.greenText,
    fontWeight: '700',
  },
  emptyFilterContainer: {
    padding: 32,
    margin: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 8,
  },
  emptyFilterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  emptyFilterText: {
    fontSize: 13,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  resetFilterButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.greenBg,
  },
  resetFilterButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.greenText,
  },
  pickupCallout: {
    backgroundColor: colors.greenBg,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.greenBorder,
  },
  pickupCalloutText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.greenText,
  },
  collectedCallout: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  collectedCalloutText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary,
  },
  infiniteScrollFooter: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingMoreText: {
    fontSize: 13,
    color: colors.green,
    fontWeight: '600',
  },
  loadMoreButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  loadMoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  endOfFeedRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  endOfFeedText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
});

import { useCurrentTime } from '@/hooks/use-current-time';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  cancelListing,
  subscribeToProviderListings,
  type FoodListing,
  type ListingStatus,
  type ListingPage,
} from '../lib/listings';
import { getFirebaseClients } from '../lib/firebase';

interface DonorListingsFeedProps {
  onCreatePress: () => void;
  onEditDraft: (listing: FoodListing) => void;
  onViewRequests?: (listing: FoodListing) => void;
  onOpenPickup?: (listing: FoodListing) => void;
  onScanPress?: () => void;
}

export function DonorListingsFeed({
  onCreatePress,
  onEditDraft,
  onViewRequests,
  onOpenPickup,
  onScanPress,
}: DonorListingsFeedProps) {
  const INITIAL_PAGE_SIZE = 10;
  const [displayLimit, setDisplayLimit] = useState(INITIAL_PAGE_SIZE);
  const [page, setPage] = useState<ListingPage>();
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const now = useCurrentTime();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    Promise.resolve()
      .then(() => {
        if (!active) return;
        const uid = getFirebaseClients().auth.currentUser?.uid;
        if (!uid) throw new Error('Sign in to view your donations.');
        stop = subscribeToProviderListings(
          uid,
          (items, metadata) => {
            if (!active) return;
            setListings(items);
            setPage(metadata);
            setHasMore(
              items.length >= displayLimit && metadata.nextCursor !== null,
            );
            setErrorMessage(null);
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
          },
          (error) => {
            if (!active) return;
            setErrorMessage(error.message);
            setListings([]);
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
          },
          { limit: displayLimit },
        );
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setErrorMessage(
          cause instanceof Error ? cause.message : 'Could not load listings.',
        );
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [displayLimit, attempt]);

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setDisplayLimit((prev) => prev + 10);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setDisplayLimit(INITIAL_PAGE_SIZE);
    setAttempt((v) => v + 1);
  };

  const handleCancelListing = (listing: FoodListing) => {
    Alert.alert(
      'Cancel Listing?',
      `Are you sure you want to cancel "${listing.title}"? This cannot be undone.`,
      [
        { text: 'Keep Open', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingId(listing.id);
              await cancelListing(listing.id);
            } catch (err: unknown) {
              Alert.alert(
                'Error',
                (err instanceof Error ? err.message : '') ||
                  'Failed to cancel listing.',
              );
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  const renderStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case 'open':
        return (
          <View style={[styles.badge, styles.badgeOpen]}>
            <Text style={[styles.badgeText, styles.badgeOpenText]}>Open</Text>
          </View>
        );
      case 'draft':
        return (
          <View style={[styles.badge, styles.badgeDraft]}>
            <Text style={[styles.badgeText, styles.badgeDraftText]}>Draft</Text>
          </View>
        );
      case 'assigned':
        return (
          <View style={[styles.badge, styles.badgeAssigned]}>
            <Text style={[styles.badgeText, styles.badgeAssignedText]}>
              Assigned
            </Text>
          </View>
        );
      case 'collected':
        return (
          <View style={[styles.badge, styles.badgeCollected]}>
            <Text style={[styles.badgeText, styles.badgeCollectedText]}>
              Collected
            </Text>
          </View>
        );
      case 'cancelled':
        return (
          <View style={[styles.badge, styles.badgeCancelled]}>
            <Text style={[styles.badgeText, styles.badgeCancelledText]}>
              Cancelled
            </Text>
          </View>
        );
      default:
        return (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{status}</Text>
          </View>
        );
    }
  };

  const renderItem = ({ item }: { item: FoodListing }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        {renderStatusBadge(item.status)}
      </View>

      <Text style={styles.description} numberOfLines={2}>
        {item.description || 'No description provided.'}
      </Text>

      <View style={styles.detailsRow}>
        <Text style={styles.detailText}>
          {item.quantity} {item.unit} • {item.storageRequirement}
        </Text>
        <Text style={styles.deadlineText}>
          Until:{' '}
          {item.pickupDeadline
            ? item.pickupDeadline.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Deadline not set'}
        </Text>
      </View>

      {item.status === 'draft' && (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!page || page.fromCache || page.hasPendingWrites}
          onPress={() => onEditDraft(item)}
        >
          <Text style={styles.cancelActionText}>Edit / publish draft</Text>
        </TouchableOpacity>
      )}
      {item.status === 'open' && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.reviewRequestsButton}
            onPress={() => onViewRequests?.(item)}
          >
            <Text style={styles.reviewRequestsText}>Review Requests</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelActionButton}
            onPress={() => handleCancelListing(item)}
            disabled={
              !!cancellingId || !page || page.fromCache || page.hasPendingWrites
            }
          >
            {cancellingId === item.id ? (
              <ActivityIndicator size="small" color="#b91c1c" />
            ) : (
              <Text style={styles.cancelActionText}>Cancel Listing</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'assigned' && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.reviewRequestsButton}
            onPress={() => onViewRequests?.(item)}
          >
            <Text style={styles.reviewRequestsText}>View Requests</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.pickupButton}
            onPress={() => onOpenPickup?.(item)}
          >
            <Text style={styles.pickupButtonText}>Handover & Pickup →</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'open' &&
        item.pickupDeadline &&
        item.pickupDeadline.getTime() <= now.getTime() && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onOpenPickup?.(item)}
            style={styles.pickupButton}
          >
            <Text style={styles.pickupButtonText}>
              Review expired pickup window
            </Text>
          </TouchableOpacity>
        )}
      {item.status === 'collected' && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.receiptButton}
            onPress={() => onOpenPickup?.(item)}
          >
            <Text style={styles.receiptButtonText}>
              View Collection Receipt
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#167044" />
        <Text style={styles.loadingText}>Loading your listings...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#167044']}
          tintColor="#167044"
        />
      }
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const isCloseToBottom =
          layoutMeasurement.height + contentOffset.y >=
          contentSize.height - 150;
        if (isCloseToBottom && hasMore && !loadingMore && !loading) {
          handleLoadMore();
        }
      }}
      scrollEventThrottle={200}
    >
      <View style={styles.topBar}>
        <View style={styles.topBarHeading}>
          <Text style={styles.feedTitle}>Your Donations</Text>
          <Text style={styles.feedSubtitle}>
            Manage your surplus food listings
          </Text>
        </View>
        <View style={styles.topBarButtons}>
          {onScanPress && (
            <TouchableOpacity
              accessibilityLabel="Scan QR code or look up reference"
              accessibilityRole="button"
              style={styles.scanButton}
              onPress={onScanPress}
            >
              <Text style={styles.scanButtonText}>📷 Scan / Lookup</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.createButton} onPress={onCreatePress}>
            <Text style={styles.createButtonText}>+ New Offer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {page?.fromCache && (
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerInfoText}>
            ⚡ Offline or reconnecting. Saved listings may be out of date.
          </Text>
        </View>
      )}
      {page?.hasPendingWrites && (
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerInfoText}>
            ⏳ Waiting for the server to confirm changes.
          </Text>
        </View>
      )}
      {errorMessage && (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.retryButton}
          onPress={() => setAttempt((v) => v + 1)}
        >
          <Text style={styles.retryButtonText}>Retry loading</Text>
        </TouchableOpacity>
      )}
      <View style={styles.listContent}>
        {listings.map((item) => (
          <View key={item.id}>{renderItem({ item })}</View>
        ))}
        {listings.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Donations Posted</Text>
            <Text style={styles.emptySubtitle}>
              Create an offer to share surplus food with verified organizations.
            </Text>
            <TouchableOpacity style={styles.emptyCta} onPress={onCreatePress}>
              <Text style={styles.emptyCtaText}>
                + Create Your First Donation
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {/* Infinite Scroll Footer */}
      <View style={styles.infiniteScrollFooter}>
        {loadingMore ? (
          <View style={styles.loadingMoreRow}>
            <ActivityIndicator size="small" color="#167044" />
            <Text style={styles.loadingMoreText}>Loading more donations…</Text>
          </View>
        ) : hasMore && listings.length >= displayLimit ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.loadMoreButton}
            onPress={handleLoadMore}
          >
            <Text style={styles.loadMoreButtonText}>
              Scroll or tap to load more
            </Text>
          </TouchableOpacity>
        ) : listings.length > 0 ? (
          <View style={styles.endOfFeedRow}>
            <Text style={styles.endOfFeedText}>
              ✨ All caught up ({listings.length} donations)
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
  contentContainer: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b',
  },
  topBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topBarHeading: {
    flexBasis: 220,
    flexGrow: 1,
    flexShrink: 1,
  },
  feedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  feedSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  createButton: {
    maxWidth: '100%',
    flexShrink: 1,
    backgroundColor: '#167044',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  createButtonText: {
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  description: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 10,
    lineHeight: 19,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  deadlineText: {
    fontSize: 12,
    color: '#075985',
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: '#F1F5F9',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  badgeOpen: {
    backgroundColor: '#DCFCE7',
  },
  badgeOpenText: {
    color: '#15803D',
  },
  badgeDraft: {
    backgroundColor: '#FEF3C7',
  },
  badgeDraftText: {
    color: '#B45309',
  },
  badgeAssigned: {
    backgroundColor: '#E0E7FF',
  },
  badgeAssignedText: {
    color: '#4338CA',
  },
  badgeCollected: {
    backgroundColor: '#E2E8F0',
  },
  badgeCollectedText: {
    color: '#475569',
  },
  badgeCancelled: {
    backgroundColor: '#FEE2E2',
  },
  badgeCancelledText: {
    color: '#B91C1C',
  },
  cardActions: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  reviewRequestsButton: {
    maxWidth: '100%',
    flexShrink: 1,
    backgroundColor: '#E1F3E8',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  reviewRequestsText: {
    color: '#167044',
    fontSize: 13,
    fontWeight: '700',
  },
  pickupButton: {
    maxWidth: '100%',
    flexShrink: 1,
    backgroundColor: '#167044',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  pickupButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  receiptButton: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  receiptButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  topBarButtons: {
    flexBasis: 220,
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  scanButton: {
    maxWidth: '100%',
    flexShrink: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  scanButtonText: {
    textAlign: 'center',
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cancelActionText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  emptyCta: {
    maxWidth: '100%',
    backgroundColor: '#167044',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyCtaText: {
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    margin: 16,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '500',
  },
  bannerInfo: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  bannerInfoText: {
    fontSize: 12,
    color: '#075985',
    fontWeight: '500',
  },
  retryButton: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginBottom: 8,
  },
  retryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  infiniteScrollFooter: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  loadingMoreText: {
    fontSize: 13,
    color: '#167044',
    fontWeight: '600',
  },
  loadMoreButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
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

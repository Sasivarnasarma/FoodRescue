import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AccountButton, AccountError } from './donor-controls';
import { LocationPickerCard } from './location-picker-card';
import {
  FOOD_CATEGORIES,
  subscribeToOpenListings,
  subscribeToListing,
  type FoodListing,
  type ListingPage,
  type ListingPageOptions,
} from '../lib/listings';
import {
  calculateHaversineDistanceKm,
  formatDistance,
  type LocationCoordinates,
} from '../lib/location-service';
import { compareDonations } from '../lib/listing-helpers';
import { matchesDonationSearch } from '../lib/donation-ui';
import { ListingDetailSheet } from './listing-detail-sheet';
import { OrganizationRequestsView } from './organization-requests-view';

export function RecipientFeed({
  initialTab = 'feed',
  readOnly = false,
}: {
  initialTab?: 'feed' | 'requests';
  readOnly?: boolean;
} = {}) {
  const [activeTab, setActiveTab] = useState<'feed' | 'requests'>(initialTab);
  const [cursors, setCursors] = useState<ListingPageOptions[]>([{}]);
  const options = cursors[cursors.length - 1];
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    options: ListingPageOptions;
    attempt: number;
    items: FoodListing[];
    page?: ListingPage;
    error?: string;
  }>();
  const [recipientLocation, setRecipientLocation] =
    useState<LocationCoordinates | null>(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [editLocation, setEditLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<{
    id: string;
    listing: FoodListing | null;
    cached: boolean;
    pending?: boolean;
    error?: string;
  }>();
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    let stop: (() => void) | undefined;
    Promise.resolve()
      .then(() => {
        if (active)
          stop = subscribeToListing(
            selectedId,
            (listing, metadata) => {
              if (active)
                setDetail({
                  id: selectedId,
                  listing,
                  cached: metadata.fromCache,
                  pending: metadata.hasPendingWrites,
                });
            },
            () => {
              if (active)
                setDetail({
                  id: selectedId,
                  listing: null,
                  cached: false,
                  error: 'This donation is unavailable or access was denied.',
                });
            },
          );
      })
      .catch(() => {
        if (active)
          setDetail({
            id: selectedId,
            listing: null,
            cached: false,
            error: 'Could not load this donation.',
          });
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [selectedId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    Promise.resolve()
      .then(() => {
        if (active)
          stop = subscribeToOpenListings(
            (items, page) => {
              if (active) setState({ options, attempt, items, page });
            },
            (error) => {
              if (active)
                setState({ options, attempt, items: [], error: error.message });
            },
            options,
          );
      })
      .catch(() => {
        if (active)
          setState({
            options,
            attempt,
            items: [],
            error: 'Could not load donations. Retry.',
          });
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [options, attempt]);
  const current =
    state?.options === options && state.attempt === attempt ? state : undefined;
  const listings = useMemo(() => current?.items ?? [], [current]);
  const page = current?.page;
  const processedListings = useMemo(
    () =>
      listings
        .filter(
          (listing) =>
            listing.pickupDeadline && listing.pickupDeadline.getTime() > now,
        )
        .filter(
          (listing) =>
            selectedCategory === 'All' || listing.category === selectedCategory,
        )
        .filter((listing) => matchesDonationSearch(listing, searchQuery))
        .map((listing) => ({
          listing,
          distanceKm:
            recipientLocation && listing.pickupLocation
              ? calculateHaversineDistanceKm(
                  recipientLocation,
                  listing.pickupLocation,
                )
              : null,
          minutesRemaining: Math.max(
            0,
            Math.ceil(((listing.pickupDeadline?.getTime() ?? 0) - now) / 60000),
          ),
        }))
        .sort((a, b) =>
          compareDonations(
            {
              id: a.listing.id,
              deadline: a.listing.pickupDeadline!.getTime(),
              distance: a.distanceKm,
            },
            {
              id: b.listing.id,
              deadline: b.listing.pickupDeadline!.getTime(),
              distance: b.distanceKm,
            },
          ),
        ),
    [listings, now, selectedCategory, searchQuery, recipientLocation],
  );
  if (selectedId) {
    const selected = detail?.id === selectedId ? detail.listing : null;
    if (detail?.id !== selectedId)
      return (
        <View style={styles.detailState}>
          <ActivityIndicator accessibilityLabel="Loading listing details" />
          <Text>Loading donation details…</Text>
          <AccountButton
            label="Back to donations"
            onPress={() => setSelectedId(undefined)}
          />
        </View>
      );
    return (
      <View style={styles.detailContainer}>
        {detail.cached && <Text>Saved information may be out of date.</Text>}
        {selected && !detail.error ? (
          <ListingDetailSheet
            key={selected.id}
            listing={selected}
            listingIsOffline={detail.cached || readOnly}
            listingHasPendingWrites={detail.pending}
            recipientLocation={recipientLocation}
            distanceKm={
              recipientLocation && selected.pickupLocation
                ? calculateHaversineDistanceKm(
                    recipientLocation,
                    selected.pickupLocation,
                  )
                : null
            }
            onBack={() => setSelectedId(undefined)}
          />
        ) : (
          <View style={styles.detailState}>
            <Text>
              This donation is no longer available, or the connection was lost.
            </Text>
            <AccountButton
              label="Back to donations"
              onPress={() => setSelectedId(undefined)}
            />
          </View>
        )}
      </View>
    );
  }
  const renderItem = ({
    item,
  }: {
    item: {
      listing: FoodListing;
      distanceKm: number | null;
      minutesRemaining: number;
    };
  }) => {
    const { listing, distanceKm, minutesRemaining } = item;
    const hours = Math.floor(minutesRemaining / 60);
    const mins = minutesRemaining % 60;
    const urgencyLabel =
      hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
    const isUrgent = minutesRemaining <= 60;

    return (
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.card}
        onPress={() => setSelectedId(listing.id)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryPillText}>
              {listing.category || 'Surplus Food'}
            </Text>
          </View>
          <View
            style={[styles.urgencyPill, isUrgent && styles.urgencyPillCritical]}
          >
            <Text
              style={[
                styles.urgencyPillText,
                isUrgent && styles.urgencyPillTextCritical,
              ]}
            >
              ⏱ {urgencyLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={1}>
          {listing.title}
        </Text>
        <Text style={styles.providerName}>{listing.providerName}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {listing.description || 'No description provided.'}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText}>
              📦 {listing.quantity} {listing.unit}
            </Text>
          </View>
          <View style={[styles.metaBadge, styles.storageMeta]}>
            <Text style={styles.metaBadgeText}>
              ❄️ {listing.storageRequirement}
            </Text>
          </View>
          <Text style={styles.distanceText}>{formatDistance(distanceKm)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabSelector}>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'feed' }}
          style={[styles.tabItem, activeTab === 'feed' && styles.tabItemActive]}
          onPress={() => setActiveTab('feed')}
        >
          <Text
            style={[
              styles.tabItemText,
              activeTab === 'feed' && styles.tabItemTextActive,
            ]}
          >
            Nearby Donations
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'requests' }}
          style={[
            styles.tabItem,
            activeTab === 'requests' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('requests')}
        >
          <Text
            style={[
              styles.tabItemText,
              activeTab === 'requests' && styles.tabItemTextActive,
            ]}
          >
            My Requests
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'requests' ? (
        <OrganizationRequestsView
          readOnly={readOnly}
          onSelectListing={(id) => setSelectedId(id)}
          onBrowseListings={() => setActiveTab('feed')}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.feedContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.title}>
              Available donations
            </Text>
            <Text style={styles.sectionSubtitle}>
              {processedListings.length} surplus{' '}
              {processedListings.length === 1 ? 'offer' : 'offers'} available
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.locationBar}
            onPress={() => setEditLocation((v) => !v)}
          >
            <Text style={styles.locationBarIcon}>📍</Text>
            <View style={styles.locationBarTextWrap}>
              <Text style={styles.locationBarTitle}>
                {recipientLocation
                  ? locationAddress || 'Current location set'
                  : 'Set your location'}
              </Text>
              <Text style={styles.locationBarSubtitle}>
                {recipientLocation
                  ? 'Tap to change location for distances'
                  : 'Distances will be calculated once set'}
              </Text>
            </View>
            <Text style={styles.locationBarAction}>
              {editLocation ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {editLocation && (
            <LocationPickerCard
              title="Your location (optional)"
              location={recipientLocation}
              address={locationAddress}
              onLocationChange={(coords, label) => {
                setRecipientLocation(coords);
                setLocationAddress(label);
              }}
            />
          )}

          <View style={styles.searchBarContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              accessibilityLabel="Search donations"
              style={styles.searchInputField}
              placeholder="Search donations by title, provider, or category..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChipsList}
          >
            {['All', ...FOOD_CATEGORIES].map((category) => {
              const isActive = selectedCategory === category;
              return (
                <TouchableOpacity
                  key={category}
                  accessibilityRole="button"
                  style={[
                    styles.categoryChip,
                    isActive && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      isActive && styles.categoryChipTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.sortHelperRow}>
            <Text style={styles.sortHelperText}>
              ⏱ Earliest pickup deadline first
            </Text>
          </View>

          {page?.fromCache && (
            <View style={styles.bannerInfo}>
              <Text
                accessibilityLiveRegion="polite"
                style={styles.bannerInfoText}
              >
                ⚡ Offline or reconnecting. Saved information may be out of
                date.
              </Text>
            </View>
          )}
          {page?.hasPendingWrites && (
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerInfoText}>
                ⏳ Waiting for server confirmation.
              </Text>
            </View>
          )}
          {!current ? (
            <ActivityIndicator accessibilityLabel="Loading donations" />
          ) : current.error ? (
            <View style={{ gap: 8, marginVertical: 8 }}>
              <AccountError message={current.error} />
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.retryButton}
                onPress={() => setAttempt((v) => v + 1)}
              >
                <Text style={styles.retryButtonText}>Retry loading</Text>
              </TouchableOpacity>
            </View>
          ) : processedListings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🍽️</Text>
              <Text style={styles.emptyTitle}>No Matching Donations</Text>
              <Text style={styles.emptySubtitle}>
                No donations match this filter or page. Check another category
                or clear your search.
              </Text>
            </View>
          ) : (
            processedListings.map((item) => (
              <View key={item.listing.id}>{renderItem({ item })}</View>
            ))
          )}

          <View style={styles.paginationBar}>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.pageButton,
                (!current || cursors.length === 1) && styles.pageButtonDisabled,
              ]}
              disabled={!current || cursors.length === 1}
              onPress={() => setCursors((v) => v.slice(0, -1))}
            >
              <Text
                style={[
                  styles.pageButtonText,
                  (!current || cursors.length === 1) &&
                    styles.pageButtonTextDisabled,
                ]}
              >
                ← Previous
              </Text>
            </TouchableOpacity>
            <View style={styles.pageIndicator}>
              <Text style={styles.pageIndicatorText}>
                Page {cursors.length}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.pageButton,
                !page?.nextCursor && styles.pageButtonDisabled,
              ]}
              disabled={!page?.nextCursor}
              onPress={() => {
                if (page?.nextCursor)
                  setCursors((v) => [...v, { after: page.nextCursor! }]);
              }}
            >
              <Text
                style={[
                  styles.pageButtonText,
                  !page?.nextCursor && styles.pageButtonTextDisabled,
                ]}
              >
                Next →
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  detailContainer: {
    flex: 1,
    gap: 12,
  },
  detailState: {
    flex: 1,
    padding: 16,
    gap: 12,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
    gap: 12,
  },
  scroll: {
    flex: 1,
  },
  feedContent: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  locationBar: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  locationBarIcon: {
    fontSize: 18,
  },
  locationBarTextWrap: {
    flex: 1,
  },
  locationBarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  locationBarSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  locationBarAction: {
    fontSize: 12,
    color: '#167044',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    minHeight: 46,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInputField: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 10,
  },
  sortHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 4,
  },
  sortHelperText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  categoryChipsList: {
    paddingVertical: 6,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryChipActive: {
    backgroundColor: '#167044',
    borderColor: '#167044',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
  cardTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100,
  },
  categoryPillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  urgencyPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100,
  },
  urgencyPillCritical: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  urgencyPillText: {
    fontSize: 11,
    color: '#075985',
    fontWeight: '600',
  },
  urgencyPillTextCritical: {
    color: '#DC2626',
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  providerName: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 6,
    fontWeight: '500',
  },
  description: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  metaBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storageMeta: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  metaBadgeText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
  },
  distanceText: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '600',
    color: '#075985',
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
  },
  bannerInfo: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 10,
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
  paginationBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  pageButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pageButtonTextDisabled: {
    color: '#94A3B8',
  },
  pageIndicator: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  pageIndicatorText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 4,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabItemText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#167044',
    fontWeight: '700',
  },
});

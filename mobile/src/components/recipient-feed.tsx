import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { ListingDetailSheet } from './listing-detail-sheet';
export function RecipientFeed() {
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
        .filter((listing) =>
          [listing.title, listing.description, listing.providerName].some(
            (value) =>
              value.toLowerCase().includes(searchQuery.trim().toLowerCase()),
          ),
        )
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
    const selected =
      detail?.id === selectedId &&
      detail.listing?.pickupDeadline &&
      detail.listing.pickupDeadline.getTime() > now
        ? detail.listing
        : null;
    if (detail?.id !== selectedId)
      return <ActivityIndicator accessibilityLabel="Loading listing details" />;
    return (
      <View style={{ gap: 12 }}>
        {page?.fromCache && <Text>Saved information may be out of date.</Text>}
        {selected && !detail.error ? (
          <ListingDetailSheet
            key={selected.id}
            listing={selected}
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
          <>
            <Text>
              This donation is no longer available, or the connection was lost.
            </Text>
            <AccountButton
              label="Back to donations"
              onPress={() => setSelectedId(undefined)}
            />
          </>
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
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={styles.title}>
        Available donations
      </Text>
      <AccountButton
        label={
          recipientLocation ? 'Change location' : 'Set location for distances'
        }
        secondary
        onPress={() => setEditLocation((v) => !v)}
      />
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
      {!recipientLocation && (
        <Text>Distance unavailable. Set a location or browse by deadline.</Text>
      )}
      <TextInput
        accessibilityLabel="Search donations"
        style={styles.searchInput}
        placeholder="Search donations"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {['All', ...FOOD_CATEGORIES].map((category) => (
          <AccountButton
            key={category}
            label={category}
            secondary={selectedCategory !== category}
            onPress={() => setSelectedCategory(category)}
          />
        ))}
      </View>
      <Text>
        Earliest deadline first. Search and categories apply to the current
        page.
      </Text>
      {page?.fromCache && (
        <Text accessibilityLiveRegion="polite">
          Offline or reconnecting. Saved information may be out of date.
        </Text>
      )}
      {page?.hasPendingWrites && <Text>Waiting for server confirmation.</Text>}
      {!current ? (
        <ActivityIndicator accessibilityLabel="Loading donations" />
      ) : current.error ? (
        <AccountError message={current.error} />
      ) : processedListings.length === 0 ? (
        <Text>
          No donations match this page. Check another page or change your
          filters.
        </Text>
      ) : (
        processedListings.map((item) => (
          <View key={item.listing.id}>{renderItem({ item })}</View>
        ))
      )}
      <AccountButton
        label="Refresh / retry"
        secondary
        onPress={() => setAttempt((v) => v + 1)}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <AccountButton
          label="Previous page"
          secondary
          disabled={!current || cursors.length === 1}
          onPress={() => setCursors((v) => v.slice(0, -1))}
        />
        <AccountButton
          label="Next page"
          secondary
          disabled={!page?.nextCursor}
          onPress={() => {
            if (page?.nextCursor)
              setCursors((v) => [...v, { after: page.nextCursor! }]);
          }}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  searchContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  locationNotice: {
    marginTop: 6,
    backgroundColor: '#fef3c7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  locationNoticeText: {
    fontSize: 11,
    color: '#b45309',
  },
  categoryChipsList: {
    paddingVertical: 10,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryChipActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#15803d',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  categoryPillText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  urgencyPill: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  urgencyPillCritical: {
    backgroundColor: '#fef2f2',
  },
  urgencyPillText: {
    fontSize: 11,
    color: '#075985',
    fontWeight: '600',
  },
  urgencyPillTextCritical: {
    color: '#dc2626',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  providerName: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metaBadge: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  storageMeta: {
    backgroundColor: '#f0fdf4',
    borderColor: '#dcfce7',
  },
  metaBadgeText: {
    fontSize: 11,
    color: '#334155',
  },
  distanceText: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '600',
    color: '#075985',
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
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
  },
});

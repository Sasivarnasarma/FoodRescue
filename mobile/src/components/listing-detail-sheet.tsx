import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getFirebaseClients } from '../lib/firebase';
import { getListingPhotoBase64, type FoodListing } from '../lib/listings';
import {
  openMapsNavigation,
  type LocationCoordinates,
} from '../lib/location-service';
import {
  subscribeToMyRequestForListing,
  withdrawDonationRequest,
  type DonationRequest,
} from '../lib/requests';
import { deriveRequestState } from '../lib/request-validation';
import { RequestForm } from './request-form';
import { RequestStatusCard } from './request-status-card';

interface ListingDetailSheetProps {
  listing: FoodListing;
  recipientLocation: LocationCoordinates | null;
  distanceKm: number | null;
  onBack: () => void;
}

export function ListingDetailSheet({
  listing,
  recipientLocation,
  distanceKm,
  onBack,
}: ListingDetailSheetProps) {
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);

  // Request state
  const { auth } = getFirebaseClients();
  const currentUid = auth.currentUser?.uid;

  const [myRequest, setMyRequest] = useState<DonationRequest | null>(null);
  const [requestMeta, setRequestMeta] = useState<{
    fromCache: boolean;
    hasPendingWrites: boolean;
  }>({ fromCache: false, hasPendingWrites: false });
  const [loadingRequest, setLoadingRequest] = useState(() =>
    Boolean(currentUid && listing.id),
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const b64 = await getListingPhotoBase64(listing.id);
        if (isMounted) setPhotoBase64(b64);
      } catch {
        // Photo read failure falls back to placeholder
      } finally {
        if (isMounted) setLoadingPhoto(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [listing.id]);

  // Subscribe to organization's request for this listing
  useEffect(() => {
    if (!currentUid || !listing.id) {
      return;
    }

    const unsubscribe = subscribeToMyRequestForListing(
      listing.id,
      currentUid,
      (request, meta) => {
        setMyRequest(request);
        setRequestMeta(meta);
        setLoadingRequest(false);
      },
      () => {
        setLoadingRequest(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [listing.id, currentUid]);

  const handleDirections = async () => {
    try {
      if (!listing.pickupLocation) {
        Alert.alert(
          'Location Missing',
          'No GPS coordinates were supplied for this listing.',
        );
        return;
      }
      await openMapsNavigation(
        listing.pickupLocation,
        listing.pickupAddress || listing.title,
      );
    } catch (err: unknown) {
      Alert.alert(
        'Maps Error',
        (err instanceof Error ? err.message : '') ||
          'Could not open maps navigation.',
      );
    }
  };

  const formatDateTime = (date?: Date | null) => {
    if (!date) return 'Flexible';
    return date.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const derivedState = deriveRequestState(myRequest, listing, currentUid ?? '');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.backButton}
        onPress={onBack}
      >
        <Text style={styles.backButtonText}>← Back to Feed</Text>
      </TouchableOpacity>

      {/* Photo Banner */}
      <View style={styles.photoContainer}>
        {loadingPhoto ? (
          <View style={styles.photoPlaceholder}>
            <ActivityIndicator size="small" color="#167044" />
            <Text style={styles.photoPlaceholderText}>
              Loading listing photo...
            </Text>
          </View>
        ) : photoBase64 ? (
          <Image
            accessibilityLabel="Donation photo supplied by the donor"
            onError={() => setPhotoBase64(null)}
            source={{ uri: `data:image/jpeg;base64,${photoBase64}` }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderText}>No photo attached</Text>
          </View>
        )}
      </View>

      {/* Header Info */}
      <View style={styles.header}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>
            {listing.category || 'Donation'}
          </Text>
        </View>
        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.providerName}>
          Provided by {listing.providerName}
        </Text>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Food Details</Text>
        <Text style={styles.description}>
          {listing.description || 'No description provided.'}
        </Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Quantity:</Text>
          <Text style={styles.infoValue}>
            {listing.quantity} {listing.unit} (Whole listing allocation)
          </Text>
        </View>
      </View>

      {/* Storage Requirements */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Storage Requirement</Text>
        <View
          style={[
            styles.storageBox,
            listing.storageRequirement === 'chilled' && styles.storageChilled,
            listing.storageRequirement === 'frozen' && styles.storageFrozen,
          ]}
        >
          <Text style={styles.storageType}>
            {listing.storageRequirement.toUpperCase()} STORAGE REQUIRED
          </Text>
          <Text style={styles.storageInstructions}>
            {listing.storageInstructions ||
              'The donor supplied no additional storage instructions.'}
          </Text>
        </View>
      </View>

      {/* Allergens */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Allergen Information</Text>
        <Text style={styles.allergenDeclaration}>
          Declaration status:{' '}
          <Text style={{ fontWeight: '600' }}>
            {listing.allergenDeclaration}
          </Text>
        </Text>
        {listing.allergenInfo ? (
          <Text style={styles.allergenInfoText}>{listing.allergenInfo}</Text>
        ) : (
          <Text style={styles.allergenHint}>
            Allergen information is unknown. Ask the donor before collection.
          </Text>
        )}
      </View>

      {/* Pickup Window & Location */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pickup Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Pickup Window:</Text>
          <Text style={styles.infoValue}>
            {formatDateTime(listing.pickupStartsAt)} to{' '}
            {formatDateTime(listing.pickupDeadline)}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Address:</Text>
          <Text style={styles.infoValue}>
            {listing.pickupAddress || 'Address on file'}
          </Text>
        </View>
        {listing.bestBeforeAt && (
          <Text>Best-before: {formatDateTime(listing.bestBeforeAt)}</Text>
        )}
        {listing.useByAt && (
          <Text>Use-by: {formatDateTime(listing.useByAt)}</Text>
        )}
        {distanceKm !== null && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Distance:</Text>
            <Text style={styles.infoValue}>
              {distanceKm.toFixed(1)} km from your location
            </Text>
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.directionsButton}
          onPress={handleDirections}
        >
          <Text style={styles.directionsButtonText}>
            Open in Google Maps / Directions
          </Text>
        </TouchableOpacity>
      </View>

      {/* Request Section */}
      {loadingRequest ? (
        <View style={styles.requestLoadingCard}>
          <ActivityIndicator size="small" color="#167044" />
          <Text style={styles.requestLoadingText}>
            Checking request status…
          </Text>
        </View>
      ) : myRequest ? (
        <RequestStatusCard
          listing={listing}
          request={myRequest}
          currentUid={currentUid ?? ''}
          isOffline={requestMeta.fromCache}
          hasPendingWrites={requestMeta.hasPendingWrites}
          onWithdraw={async () => {
            if (!currentUid) return;
            await withdrawDonationRequest(listing.id, currentUid);
          }}
        />
      ) : derivedState.canRequest ? (
        <RequestForm
          listing={listing}
          departureLocation={
            recipientLocation
              ? {
                  latitude: recipientLocation.latitude,
                  longitude: recipientLocation.longitude,
                }
              : null
          }
        />
      ) : (
        <View style={styles.closedCard}>
          <Text style={styles.closedTitle}>{derivedState.label}</Text>
          <Text style={styles.closedDescription}>
            {derivedState.description}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 14,
    color: '#075985',
    fontWeight: '600',
  },
  photoContainer: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    marginBottom: 16,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoPlaceholderText: {
    fontSize: 13,
    color: '#64748b',
  },
  header: {
    marginBottom: 16,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  categoryBadgeText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  providerName: {
    fontSize: 14,
    color: '#64748b',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    width: 120,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  storageBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  storageChilled: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  storageFrozen: {
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
  },
  storageType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  storageInstructions: {
    fontSize: 13,
    color: '#334155',
  },
  allergenDeclaration: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  allergenInfoText: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '500',
  },
  allergenHint: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  directionsButton: {
    marginTop: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  directionsButtonText: {
    color: '#075985',
    fontSize: 13,
    fontWeight: '600',
  },
  requestLoadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  requestLoadingText: {
    color: '#64748b',
    fontSize: 13,
  },
  closedCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    gap: 6,
    marginTop: 12,
  },
  closedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  closedDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
});

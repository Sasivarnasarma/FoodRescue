import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AccountButton, AccountError, AccountField } from './donor-controls';
import { DepartureLocationCard } from './departure-location-card';
import {
  formatCoordinates,
  getRequestDistanceInfo,
  type Coordinates,
} from '../lib/departure-location';
import { getFirebaseClients } from '../lib/firebase';
import { type FoodListing } from '../lib/listings';
import {
  submitDonationRequest,
  subscribeToMyRequestForListing,
  withdrawDonationRequest,
  type DonationRequest,
} from '../lib/requests';

export interface RecipientRequestModalProps {
  visible: boolean;
  listing: FoodListing;
  initialLocation?: Coordinates | null;
  initialAddress?: string;
  onClose: () => void;
  onRequestSubmitted?: () => void;
}

function computeDefaultProposedTime(listing: FoodListing): string {
  const now = Date.now();
  const startsAt = listing.pickupStartsAt
    ? listing.pickupStartsAt.getTime()
    : now;
  const deadline = listing.pickupDeadline
    ? listing.pickupDeadline.getTime()
    : now + 3600000;

  const defaultProposed = new Date(Math.max(now + 1800000, startsAt));
  if (defaultProposed.getTime() > deadline - 900000) {
    defaultProposed.setTime(deadline - 900000);
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const y = defaultProposed.getFullYear();
  const m = pad(defaultProposed.getMonth() + 1);
  const d = pad(defaultProposed.getDate());
  const hh = pad(defaultProposed.getHours());
  const mm = pad(defaultProposed.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function parseProposedDate(str: string): Date {
  const trimmed = str.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error('Enter proposed pickup time in YYYY-MM-DD HH:MM format.');
  }
  const [, y, m, d, hh, mm] = match;
  const parsed = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
  );
  if (isNaN(parsed.getTime())) {
    throw new Error('Enter a valid proposed pickup date and time.');
  }
  return parsed;
}

function RequestModalContent({
  listing,
  initialLocation,
  initialAddress,
  onClose,
  onRequestSubmitted,
}: {
  listing: FoodListing;
  initialLocation: Coordinates | null;
  initialAddress: string;
  onClose: () => void;
  onRequestSubmitted?: () => void;
}) {
  const [departureLocation, setDepartureLocation] =
    useState<Coordinates | null>(initialLocation);
  const [departureAddress, setDepartureAddress] = useState(initialAddress);
  const [canMeetStorage, setCanMeetStorage] = useState(false);
  const [proposedTimeStr, setProposedTimeStr] = useState(() =>
    computeDefaultProposedTime(listing),
  );
  const [existingRequest, setExistingRequest] =
    useState<DonationRequest | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Subscribe to organization's own existing request for this listing
  useEffect(() => {
    const { auth } = getFirebaseClients();
    const currentUser = auth.currentUser;
    if (!currentUser || !listing.id) {
      return;
    }

    const unsubscribe = subscribeToMyRequestForListing(
      listing.id,
      currentUser.uid,
      (req) => {
        setExistingRequest(req);
        setLoadingExisting(false);
      },
      () => {
        setLoadingExisting(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [listing.id]);

  const handleSubmit = async () => {
    setError('');
    setSuccessMessage('');

    if (!canMeetStorage) {
      setError(
        `You must confirm your organization can meet the ${listing.storageRequirement} storage requirement.`,
      );
      return;
    }

    let plannedPickupAt: Date;
    try {
      plannedPickupAt = parseProposedDate(proposedTimeStr);
    } catch (parseErr) {
      setError((parseErr as Error).message);
      return;
    }

    const now = Date.now();
    const deadline = listing.pickupDeadline
      ? listing.pickupDeadline.getTime()
      : 0;
    const startsAt = listing.pickupStartsAt
      ? listing.pickupStartsAt.getTime()
      : 0;

    if (now + 15 * 60 * 1000 > deadline) {
      setError(
        'Requests must be submitted at least 15 minutes before the pickup deadline.',
      );
      return;
    }

    if (
      plannedPickupAt.getTime() < now ||
      plannedPickupAt.getTime() < startsAt ||
      plannedPickupAt.getTime() > deadline
    ) {
      setError(
        'Proposed pickup time must be in the future and within the pickup window.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await submitDonationRequest({
        listingId: listing.id,
        plannedPickupAt,
        canMeetStorageRequirement: true,
        departureLocation: departureLocation ?? undefined,
      });

      setSuccessMessage('Your request has been submitted for donor review!');
      onRequestSubmitted?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not submit request.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    setError('');
    const { auth } = getFirebaseClients();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('You must be signed in to withdraw your request.');
      return;
    }

    setWithdrawing(true);
    try {
      await withdrawDonationRequest(listing.id, currentUser.uid);
      setSuccessMessage('Your request has been withdrawn.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not withdraw request.',
      );
    } finally {
      setWithdrawing(false);
    }
  };

  const currentDistanceInfo = getRequestDistanceInfo(
    departureLocation,
    listing.pickupLocation,
  );

  return (
    <ScrollView
      style={styles.modalScroll}
      contentContainerStyle={styles.modalContent}
    >
      <TouchableOpacity
        accessibilityRole="button"
        onPress={onClose}
        style={styles.closeButton}
      >
        <Text style={styles.closeButtonText}>✕ Close</Text>
      </TouchableOpacity>

      <Text accessibilityRole="header" style={styles.modalTitle}>
        Request Donation
      </Text>
      <Text style={styles.listingSubtitle}>
        {listing.title} ({listing.quantity} {listing.unit})
      </Text>

      {loadingExisting && existingRequest === null ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#167044" />
          <Text style={styles.loadingText}>Checking request status…</Text>
        </View>
      ) : existingRequest ? (
        /* Already requested view */
        <View style={styles.existingCard}>
          <Text style={styles.existingTitle}>
            Request Status: {existingRequest.status.toUpperCase()}
          </Text>
          <Text style={styles.existingBody}>
            Proposed pickup:{' '}
            {existingRequest.plannedPickupAt.toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <Text style={styles.existingBody}>
            Departure coordinates:{' '}
            {formatCoordinates(existingRequest.departureLocation)}
          </Text>

          {existingRequest.status === 'requested' ? (
            <View style={styles.withdrawSection}>
              <Text style={styles.withdrawHint}>
                You have submitted a pending request for this entire donation.
                You can withdraw it before the donor approves.
              </Text>
              <AccountButton
                label={withdrawing ? 'Withdrawing…' : 'Withdraw request'}
                secondary
                disabled={withdrawing}
                onPress={() => void handleWithdraw()}
              />
            </View>
          ) : existingRequest.status === 'approved' ? (
            <View style={styles.approvedNotice}>
              <Text style={styles.approvedNoticeText}>
                🎉 Your request was approved by the donor! Prepare for pickup.
              </Text>
            </View>
          ) : (
            <Text style={styles.existingBody}>
              This request is {existingRequest.status}.
            </Text>
          )}
        </View>
      ) : (
        /* Submission form */
        <View style={styles.formContainer}>
          {/* Storage requirement affirmation */}
          <View style={styles.storageBox}>
            <Text style={styles.storageHeader}>
              Storage Requirement: {listing.storageRequirement.toUpperCase()}
            </Text>
            <Text style={styles.storageInstructions}>
              {listing.storageInstructions ||
                'No additional storage instructions.'}
            </Text>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: canMeetStorage }}
              style={styles.checkboxRow}
              onPress={() => setCanMeetStorage((v) => !v)}
            >
              <View
                style={[
                  styles.checkbox,
                  canMeetStorage && styles.checkboxChecked,
                ]}
              >
                {canMeetStorage ? (
                  <Text style={styles.checkMark}>✓</Text>
                ) : null}
              </View>
              <Text style={styles.checkboxLabel}>
                I confirm our organization can meet the{' '}
                <Text style={{ fontWeight: '700' }}>
                  {listing.storageRequirement}
                </Text>{' '}
                storage requirement for the full quantity.
              </Text>
            </TouchableOpacity>
          </View>

          {/* Proposed pickup time */}
          <View style={styles.sectionBox}>
            <Text style={styles.sectionHeader}>Proposed Pickup Time</Text>
            <Text style={styles.sectionHint}>
              Window:{' '}
              {listing.pickupStartsAt?.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              to{' '}
              {listing.pickupDeadline?.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              . Must be at least 15 min before deadline.
            </Text>
            <AccountField
              label="Pickup Date & Time (YYYY-MM-DD HH:MM)"
              value={proposedTimeStr}
              keyboardType="numbers-and-punctuation"
              placeholder="YYYY-MM-DD HH:MM"
              onChangeText={setProposedTimeStr}
            />
          </View>

          {/* Departure point coordinates component */}
          <DepartureLocationCard
            departureLocation={departureLocation}
            pickupLocation={listing.pickupLocation}
            initialAddress={departureAddress}
            onLocationChange={(coords, addr) => {
              setDepartureLocation(coords);
              if (addr !== undefined) setDepartureAddress(addr);
            }}
          />

          {/* Live distance status summary */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Matching Feasibility:</Text>
            <Text style={styles.summaryText}>
              {currentDistanceInfo.isAvailable
                ? `Distance from departure to pickup: ${currentDistanceInfo.formattedDistance}`
                : `Distance: ${currentDistanceInfo.explanation}`}
            </Text>
          </View>

          {/* Error display */}
          {error ? <AccountError message={error} /> : null}

          {/* Success message */}
          {successMessage ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {/* Submit button */}
          <AccountButton
            label={
              submitting ? 'Submitting request…' : 'Submit Donation Request'
            }
            disabled={submitting || !canMeetStorage}
            onPress={() => void handleSubmit()}
          />
        </View>
      )}
    </ScrollView>
  );
}

export function RecipientRequestModal({
  visible,
  listing,
  initialLocation = null,
  initialAddress = '',
  onClose,
  onRequestSubmitted,
}: RecipientRequestModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      {visible ? (
        <RequestModalContent
          listing={listing}
          initialLocation={initialLocation}
          initialAddress={initialAddress}
          onClose={onClose}
          onRequestSubmitted={onRequestSubmitted}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScroll: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalContent: {
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 40 : 20,
    paddingBottom: 40,
    gap: 16,
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  closeButtonText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  listingSubtitle: {
    fontSize: 16,
    color: '#167044',
    fontWeight: '600',
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#64748b',
    fontSize: 14,
  },
  existingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    gap: 12,
  },
  existingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803d',
  },
  existingBody: {
    fontSize: 14,
    color: '#334155',
  },
  withdrawSection: {
    marginTop: 8,
    gap: 10,
  },
  withdrawHint: {
    fontSize: 13,
    color: '#64748b',
  },
  approvedNotice: {
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 8,
  },
  approvedNoticeText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 14,
  },
  formContainer: {
    gap: 16,
  },
  storageBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    gap: 10,
  },
  storageHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  storageInstructions: {
    fontSize: 13,
    color: '#475569',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#167044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#167044',
  },
  checkMark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
  },
  sectionBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    gap: 8,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionHint: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  summaryBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
  },
  summaryText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  successBanner: {
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  successText: {
    color: '#15803d',
    fontSize: 14,
    fontWeight: '600',
  },
});

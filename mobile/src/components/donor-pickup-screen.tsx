import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AccountError,
  accountErrorMessage,
  donorColors,
} from '@/components/donor-controls';
import { useCurrentTime } from '@/hooks/use-current-time';
import {
  subscribeToListing,
  type FoodListing,
  type ListingPage,
} from '@/lib/listings';
import {
  cancelApprovedDonation,
  completePickupCollection,
  reconcileExpiredListing,
} from '@/lib/pickup';
import { checkDonorCollectionEligibility } from '@/lib/pickup-validation';
import {
  subscribeToMyRequestForListing,
  type DonationRequest,
} from '@/lib/requests';

export interface DonorPickupScreenProps {
  listing: FoodListing;
  onBack: () => void;
  onDonationUpdated?: () => void;
}

export function DonorPickupScreen({
  listing: initialListing,
  onBack,
  onDonationUpdated,
}: DonorPickupScreenProps) {
  const [listing, setListing] = useState<FoodListing>(initialListing);
  const [request, setRequest] = useState<DonationRequest | null>(null);
  const [listingMeta, setListingMeta] = useState<
    Pick<ListingPage, 'fromCache' | 'hasPendingWrites'>
  >({ fromCache: false, hasPendingWrites: false });
  const [requestMeta, setRequestMeta] = useState<
    Pick<ListingPage, 'fromCache' | 'hasPendingWrites'>
  >({ fromCache: false, hasPendingWrites: false });

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<
    'collect' | 'release' | 'close' | 'expire' | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const now = useCurrentTime();

  // Subscribe to live listing state
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;

    Promise.resolve().then(() => {
      if (!active) return;
      stop = subscribeToListing(
        initialListing.id,
        (updated, meta) => {
          if (!active) return;
          if (updated) {
            setListing(updated);
          }
          setListingMeta(meta);
          setLoading(false);
        },
        (err) => {
          if (!active) return;
          setErrorMessage(err.message || 'Could not load donation details.');
          setLoading(false);
        },
      );
    });

    return () => {
      active = false;
      stop?.();
    };
  }, [initialListing.id]);

  // Subscribe to the approved assigned request
  const assignedOrgUid = listing.acceptedOrganizationUid;
  useEffect(() => {
    if (!assignedOrgUid) {
      setRequest(null);
      return;
    }

    let active = true;
    let stop: (() => void) | undefined;

    Promise.resolve().then(() => {
      if (!active) return;
      stop = subscribeToMyRequestForListing(
        listing.id,
        assignedOrgUid,
        (req, meta) => {
          if (!active) return;
          setRequest(req);
          setRequestMeta(meta);
        },
        (err) => {
          if (!active) return;
          setErrorMessage(err.message || 'Could not load recipient request.');
        },
      );
    });

    return () => {
      active = false;
      stop?.();
    };
  }, [listing.id, assignedOrgUid]);

  const isOffline = listingMeta.fromCache || requestMeta.fromCache;
  const isPendingWrites =
    listingMeta.hasPendingWrites || requestMeta.hasPendingWrites;

  // Evaluate collection eligibility with live second-by-second countdown
  const eligibility = checkDonorCollectionEligibility(
    listing.pickupStartsAt,
    listing.pickupDeadline,
    request?.recipientConfirmedAt,
    now.getTime(),
  );

  const remainingSeconds = Math.max(
    0,
    Math.floor(eligibility.remainingConfirmationMs / 1000),
  );
  const countdownMinutes = Math.floor(remainingSeconds / 60);
  const countdownSeconds = remainingSeconds % 60;
  const formattedCountdown = `${String(countdownMinutes).padStart(2, '0')}:${String(
    countdownSeconds,
  ).padStart(2, '0')}`;

  const formatTime = (date?: Date | null) => {
    if (!date) return 'Not set';
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (date?: Date | null) => {
    if (!date) return 'Not set';
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 1. Complete Collection Action
  const handleCompleteCollection = () => {
    if (!assignedOrgUid) {
      Alert.alert('Error', 'No recipient is assigned to this donation.');
      return;
    }
    if (isOffline) {
      Alert.alert(
        'Offline',
        'Cannot complete collection while offline. Connect to the internet.',
      );
      return;
    }
    if (isPendingWrites) {
      Alert.alert('Please Wait', 'Waiting for previous updates to sync.');
      return;
    }
    if (!eligibility.canCollect) {
      Alert.alert('Collection Not Ready', eligibility.message);
      return;
    }

    const orgName = request?.organizationName || assignedOrgUid;
    Alert.alert(
      'Confirm Handover Collection',
      `Complete collection and handover of ${listing.quantity} ${listing.unit} of "${listing.title}" to ${orgName}?\n\nThis will finalize the donation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Collection',
          style: 'default',
          onPress: async () => {
            setBusyAction('collect');
            setErrorMessage(null);
            try {
              await completePickupCollection(listing.id, assignedOrgUid);
              setSuccessNotice(
                `Collection finalized! Handover of "${listing.title}" to ${orgName} is complete.`,
              );
              onDonationUpdated?.();
              Alert.alert(
                'Collection Complete!',
                `Successfully recorded handover to ${orgName}. The donation is marked as collected in your history.`,
              );
            } catch (err) {
              const msg = accountErrorMessage(
                err,
                err instanceof Error
                  ? err.message
                  : 'Failed to complete collection.',
              );
              setErrorMessage(msg);
              Alert.alert('Collection Failed', msg);
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  };

  // 2. Release Assignment Action (Reopens if >= 15 min left)
  const handleReleaseAssignment = () => {
    if (!assignedOrgUid) return;
    const canReopen =
      listing.pickupDeadline &&
      now.getTime() + 15 * 60_000 <= listing.pickupDeadline.getTime();

    const promptMessage = canReopen
      ? `Release the assignment to ${request?.organizationName || assignedOrgUid}? The listing will reopen for other organizations to request.`
      : `Less than 15 minutes remain before the deadline. Releasing will cancel this listing.`;

    Alert.alert('Release Assignment', promptMessage, [
      { text: 'Keep Assignment', style: 'cancel' },
      {
        text: canReopen ? 'Release and Reopen' : 'Cancel Listing',
        style: 'destructive',
        onPress: async () => {
          setBusyAction('release');
          setErrorMessage(null);
          try {
            const { reopened } = await cancelApprovedDonation(
              listing.id,
              assignedOrgUid,
              'release',
            );
            setSuccessNotice(
              reopened
                ? 'Assignment released. Listing is open again.'
                : 'Assignment released. Listing has been cancelled.',
            );
            onDonationUpdated?.();
          } catch (err) {
            const msg = accountErrorMessage(
              err,
              err instanceof Error
                ? err.message
                : 'Failed to release assignment.',
            );
            setErrorMessage(msg);
            Alert.alert('Action Failed', msg);
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  };

  // 3. Explicit Donor Close
  const handleCloseDonation = () => {
    if (!assignedOrgUid) return;
    Alert.alert(
      'Close Donation',
      `Are you sure you want to completely cancel and close "${listing.title}"? This cannot be undone.`,
      [
        { text: 'No, Keep Open', style: 'cancel' },
        {
          text: 'Yes, Close Donation',
          style: 'destructive',
          onPress: async () => {
            setBusyAction('close');
            setErrorMessage(null);
            try {
              await cancelApprovedDonation(
                listing.id,
                assignedOrgUid,
                'close',
              );
              setSuccessNotice('Donation has been closed and cancelled.');
              onDonationUpdated?.();
            } catch (err) {
              const msg = accountErrorMessage(
                err,
                err instanceof Error ? err.message : 'Failed to close donation.',
              );
              setErrorMessage(msg);
              Alert.alert('Action Failed', msg);
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  };

  // 4. Reconcile Expiry Action
  const handleReconcileExpiry = async () => {
    setBusyAction('expire');
    setErrorMessage(null);
    try {
      await reconcileExpiredListing(listing.id);
      setSuccessNotice('Listing reconciled as expired.');
      onDonationUpdated?.();
    } catch (err) {
      const msg = accountErrorMessage(
        err,
        err instanceof Error ? err.message : 'Failed to reconcile expiry.',
      );
      setErrorMessage(msg);
      Alert.alert('Action Failed', msg);
    } finally {
      setBusyAction(null);
    }
  };

  const isCollected = listing.status === 'collected';
  const isAssigned = listing.status === 'assigned';
  const isExpired = listing.status === 'expired';
  const isCancelled = listing.status === 'cancelled';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Back Navigation */}
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.backButton}
        onPress={onBack}
      >
        <Text style={styles.backButtonText}>← Back to Your Donations</Text>
      </TouchableOpacity>

      {/* Screen Title */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>
          {isCollected ? 'Collection Receipt' : 'Pickup & Handover'}
        </Text>
        <Text style={styles.screenSubtitle}>
          {isCollected
            ? 'Completed donation handover record'
            : 'Verify recipient confirmation and complete collection'}
        </Text>
      </View>

      {/* Banners for Offline and Pending Writes */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Offline or reconnecting. Viewing saved details. An active internet
            connection is required to finalize collection.
          </Text>
        </View>
      )}
      {isPendingWrites && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            Waiting for server confirmation of recent changes...
          </Text>
        </View>
      )}
      {successNotice && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{successNotice}</Text>
        </View>
      )}
      {errorMessage && (
        <View style={styles.errorBox}>
          <AccountError message={errorMessage} />
        </View>
      )}

      {/* Main Listing Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listingTitle}>{listing.title}</Text>
            <Text style={styles.listingSubtitle}>
              {listing.quantity} {listing.unit} • {listing.category}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              isCollected && styles.badgeCollected,
              isAssigned && styles.badgeAssigned,
              isExpired && styles.badgeExpired,
              isCancelled && styles.badgeCancelled,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isCollected && styles.badgeCollectedText,
                isAssigned && styles.badgeAssignedText,
                isExpired && styles.badgeExpiredText,
                isCancelled && styles.badgeCancelledText,
              ]}
            >
              {listing.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <Text style={styles.metaLabel}>Storage Requirement:</Text>
          <Text style={styles.metaValue}>
            {listing.storageRequirement.toUpperCase()}
          </Text>
        </View>

        <View style={styles.detailsRow}>
          <Text style={styles.metaLabel}>Pickup Window:</Text>
          <Text style={styles.metaValue}>
            {formatTime(listing.pickupStartsAt)} - {formatDate(listing.pickupDeadline)}
          </Text>
        </View>

        {listing.pickupAddress ? (
          <View style={styles.detailsRow}>
            <Text style={styles.metaLabel}>Pickup Address:</Text>
            <Text style={styles.metaValue}>{listing.pickupAddress}</Text>
          </View>
        ) : null}

        {listing.referenceId ? (
          <View style={styles.detailsRow}>
            <Text style={styles.metaLabel}>Reference ID:</Text>
            <Text style={styles.metaCode}>{listing.id}</Text>
          </View>
        ) : null}
      </View>

      {/* Loading state */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={donorColors.green} />
          <Text style={styles.loadingText}>Loading handover details...</Text>
        </View>
      ) : isCollected ? (
        /* SECTION: Collected State (History Receipt) */
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyCheckIcon}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyTitle}>Collection Completed</Text>
              <Text style={styles.historySubtitle}>
                Handover finalized and confirmed
              </Text>
            </View>
          </View>

          <View style={styles.historyDivider} />

          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Collected At:</Text>
            <Text style={styles.historyValue}>
              {formatDate(listing.collectedAt)}
            </Text>
          </View>

          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Recipient:</Text>
            <Text style={styles.historyValue}>
              {request?.organizationName ||
                listing.acceptedOrganizationUid ||
                'Verified Recipient'}
            </Text>
          </View>

          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Recipient UID:</Text>
            <Text style={styles.historyCode}>
              {listing.acceptedOrganizationUid}
            </Text>
          </View>

          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Quantity Handed Over:</Text>
            <Text style={styles.historyValue}>
              {listing.quantity} {listing.unit} (Whole listing)
            </Text>
          </View>

          {listing.storageInstructions ? (
            <View style={styles.historyRow}>
              <Text style={styles.historyLabel}>Storage Handled:</Text>
              <Text style={styles.historyValue}>
                {listing.storageInstructions}
              </Text>
            </View>
          ) : null}

          <View style={styles.historyFooterNote}>
            <Text style={styles.historyNoteText}>
              ✓ Handover verified through signed-in QR/reference collection.
              {'\n'}This record is permanently preserved in your donor history.
            </Text>
          </View>
        </View>
      ) : isAssigned ? (
        /* SECTION: Active Assigned Pickup & Handover Flow */
        <View style={styles.pickupFlowContainer}>
          {/* Assigned Recipient Card */}
          <View style={styles.recipientCard}>
            <Text style={styles.sectionHeader}>Assigned Recipient</Text>
            <Text style={styles.recipientName}>
              {request?.organizationName ||
                `Organization (${assignedOrgUid})`}
            </Text>
            <Text style={styles.recipientUid}>UID: {assignedOrgUid}</Text>

            {request?.plannedPickupAt ? (
              <View style={styles.detailsRow}>
                <Text style={styles.metaLabel}>Proposed Pickup:</Text>
                <Text style={styles.metaValue}>
                  {formatTime(request.plannedPickupAt)}
                </Text>
              </View>
            ) : null}

            <View style={styles.affirmationRow}>
              <Text style={styles.affirmationIcon}>✓</Text>
              <Text style={styles.affirmationText}>
                Storage capability confirmed ({listing.storageRequirement})
              </Text>
            </View>
          </View>

          {/* Live Handover Status Panel */}
          <View
            style={[
              styles.statusPanel,
              eligibility.status === 'ready' && styles.statusPanelReady,
              eligibility.status === 'awaiting_confirmation' &&
                styles.statusPanelAwaiting,
              eligibility.status === 'expired_confirmation' &&
                styles.statusPanelExpired,
            ]}
          >
            <View style={styles.statusPanelHeader}>
              <Text style={styles.statusPanelTitle}>
                Handover Confirmation Status
              </Text>
              <View
                style={[
                  styles.statusPill,
                  eligibility.status === 'ready' && styles.statusPillReady,
                  eligibility.status === 'awaiting_confirmation' &&
                    styles.statusPillAwaiting,
                  eligibility.status === 'expired_confirmation' &&
                    styles.statusPillExpired,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    eligibility.status === 'ready' && styles.statusPillReadyText,
                    eligibility.status === 'awaiting_confirmation' &&
                      styles.statusPillAwaitingText,
                    eligibility.status === 'expired_confirmation' &&
                      styles.statusPillExpiredText,
                  ]}
                >
                  {eligibility.status === 'ready'
                    ? 'READY TO COLLECT'
                    : eligibility.status === 'awaiting_confirmation'
                      ? 'AWAITING RECIPIENT'
                      : eligibility.status === 'expired_confirmation'
                        ? 'CONFIRMATION EXPIRED'
                        : 'WINDOW CLOSED'}
                </Text>
              </View>
            </View>

            <Text style={styles.statusMessage}>{eligibility.message}</Text>

            {/* Live 5-minute countdown display */}
            {eligibility.status === 'ready' && (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownLabel}>
                  Confirmation Time Remaining:
                </Text>
                <Text style={styles.countdownTime}>{formattedCountdown}</Text>
                <Text style={styles.countdownHint}>
                  (Inclusive 5-minute security limit)
                </Text>
              </View>
            )}

            {request?.recipientConfirmedAt && (
              <Text style={styles.confirmedTimestampText}>
                Recipient confirmed at: {formatTime(request.recipientConfirmedAt)}
              </Text>
            )}
          </View>

          {/* Complete Collection Button */}
          <View style={styles.actionContainer}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Complete Collection"
              disabled={
                !eligibility.canCollect ||
                isOffline ||
                isPendingWrites ||
                Boolean(busyAction)
              }
              style={[
                styles.completeButton,
                (!eligibility.canCollect ||
                  isOffline ||
                  isPendingWrites ||
                  Boolean(busyAction)) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleCompleteCollection}
            >
              {busyAction === 'collect' ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.completeButtonText}>
                  ✓ Complete Collection
                </Text>
              )}
            </TouchableOpacity>

            {!eligibility.canCollect && (
              <Text style={styles.actionDisabledHint}>
                {eligibility.status === 'awaiting_confirmation'
                  ? 'Ask the recipient to confirm handover on their phone before completing.'
                  : eligibility.status === 'expired_confirmation'
                    ? 'The confirmation window expired. The recipient must confirm again.'
                    : 'Collection cannot be completed at this time.'}
              </Text>
            )}
          </View>

          {/* Assignment Management / Cancellation Options */}
          <View style={styles.cancellationSection}>
            <Text style={styles.cancellationSectionTitle}>
              Assignment Management
            </Text>
            <View style={styles.cancellationButtonsRow}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={Boolean(busyAction) || isOffline}
                style={[
                  styles.cancelSecondaryButton,
                  (Boolean(busyAction) || isOffline) && styles.buttonDisabled,
                ]}
                onPress={handleReleaseAssignment}
              >
                {busyAction === 'release' ? (
                  <ActivityIndicator size="small" color="#c2410c" />
                ) : (
                  <Text style={styles.cancelSecondaryButtonText}>
                    Release Assignment
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={Boolean(busyAction) || isOffline}
                style={[
                  styles.cancelDangerButton,
                  (Boolean(busyAction) || isOffline) && styles.buttonDisabled,
                ]}
                onPress={handleCloseDonation}
              >
                {busyAction === 'close' ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <Text style={styles.cancelDangerButtonText}>
                    Close Donation
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : isExpired ? (
        /* SECTION: Expired Listing */
        <View style={styles.card}>
          <Text style={styles.expiredTitle}>Donation Expired</Text>
          <Text style={styles.expiredBody}>
            The pickup deadline ({formatDate(listing.pickupDeadline)}) has elapsed.
          </Text>
          <TouchableOpacity
            style={styles.reconcileButton}
            disabled={Boolean(busyAction) || isOffline}
            onPress={handleReconcileExpiry}
          >
            {busyAction === 'expire' ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.reconcileButtonText}>Reconcile Expiry</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* SECTION: Cancelled or Open */
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>
            {isCancelled ? 'Donation Cancelled' : 'Donation Open'}
          </Text>
          <Text style={styles.metaLabel}>
            {isCancelled
              ? 'This donation has been cancelled and is no longer available.'
              : 'This donation is currently open and awaiting request approval.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: donorColors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  backButton: {
    paddingVertical: 6,
  },
  backButtonText: {
    color: donorColors.green,
    fontSize: 15,
    fontWeight: '700',
  },
  screenHeader: {
    gap: 2,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: donorColors.text,
  },
  screenSubtitle: {
    fontSize: 13,
    color: donorColors.secondary,
  },
  offlineBanner: {
    backgroundColor: '#ffedd5',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  offlineText: {
    fontSize: 13,
    color: '#9a3412',
    fontWeight: '500',
  },
  pendingBanner: {
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    padding: 10,
  },
  pendingText: {
    fontSize: 13,
    color: '#0369a1',
  },
  successBanner: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  successText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
  },
  errorBox: {
    gap: 8,
  },
  card: {
    backgroundColor: donorColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: donorColors.border,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  listingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: donorColors.text,
  },
  listingSubtitle: {
    fontSize: 13,
    color: donorColors.secondary,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  badgeAssigned: {
    backgroundColor: '#dbeafe',
  },
  badgeAssignedText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 11,
  },
  badgeCollected: {
    backgroundColor: '#dcfce7',
  },
  badgeCollectedText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 11,
  },
  badgeExpired: {
    backgroundColor: '#fee2e2',
  },
  badgeExpiredText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 11,
  },
  badgeCancelled: {
    backgroundColor: '#f1f5f9',
  },
  badgeCancelledText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 11,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  metaLabel: {
    fontSize: 13,
    color: donorColors.secondary,
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 13,
    color: donorColors.text,
    fontWeight: '600',
  },
  metaCode: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#334155',
  },
  centerBox: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: donorColors.secondary,
  },
  pickupFlowContainer: {
    gap: 14,
  },
  recipientCard: {
    backgroundColor: donorColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: donorColors.border,
    gap: 6,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: donorColors.text,
    marginBottom: 2,
  },
  recipientName: {
    fontSize: 17,
    fontWeight: '700',
    color: donorColors.green,
  },
  recipientUid: {
    fontSize: 12,
    color: donorColors.secondary,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  affirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  affirmationIcon: {
    color: donorColors.green,
    fontWeight: '900',
    fontSize: 14,
  },
  affirmationText: {
    fontSize: 13,
    color: donorColors.text,
    fontWeight: '500',
  },
  statusPanel: {
    backgroundColor: donorColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  statusPanelReady: {
    borderColor: donorColors.green,
    backgroundColor: '#f0fdf4',
  },
  statusPanelAwaiting: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  statusPanelExpired: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  statusPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPanelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: donorColors.text,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  statusPillReady: {
    backgroundColor: '#bbf7d0',
  },
  statusPillReadyText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  statusPillAwaiting: {
    backgroundColor: '#fef3c7',
  },
  statusPillAwaitingText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '800',
  },
  statusPillExpired: {
    backgroundColor: '#fee2e2',
  },
  statusPillExpiredText: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '800',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusMessage: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  countdownBox: {
    backgroundColor: '#ffffff',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  countdownTime: {
    fontSize: 32,
    fontWeight: '800',
    color: donorColors.green,
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  countdownHint: {
    fontSize: 11,
    color: donorColors.secondary,
  },
  confirmedTimestampText: {
    fontSize: 11,
    color: donorColors.secondary,
    fontStyle: 'italic',
  },
  actionContainer: {
    gap: 6,
    marginTop: 4,
  },
  completeButton: {
    backgroundColor: donorColors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actionDisabledHint: {
    fontSize: 12,
    color: donorColors.secondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  cancellationSection: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  cancellationSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: donorColors.secondary,
  },
  cancellationButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelSecondaryButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelSecondaryButtonText: {
    color: '#c2410c',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelDangerButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelDangerButtonText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    gap: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyCheckIcon: {
    fontSize: 24,
    color: '#16a34a',
    fontWeight: '900',
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#166534',
  },
  historySubtitle: {
    fontSize: 12,
    color: donorColors.secondary,
  },
  historyDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  historyLabel: {
    fontSize: 13,
    color: donorColors.secondary,
  },
  historyValue: {
    fontSize: 13,
    fontWeight: '700',
    color: donorColors.text,
  },
  historyCode: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#334155',
  },
  historyFooterNote: {
    marginTop: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
  },
  historyNoteText: {
    fontSize: 12,
    color: '#15803d',
    lineHeight: 16,
    textAlign: 'center',
  },
  expiredTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#b91c1c',
  },
  expiredBody: {
    fontSize: 13,
    color: donorColors.secondary,
  },
  reconcileButton: {
    backgroundColor: '#b91c1c',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  reconcileButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});

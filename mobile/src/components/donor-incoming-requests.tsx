import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { subscribeToListing } from '@/lib/listings';
import type {
  FoodListing,
  ListingPage,
  ListingPageOptions,
} from '@/lib/listings';
import {
  rankListingRequests,
  checkRequestEligibility,
  explainRankingComparison,
} from '@/lib/request-ranking';
import {
  approveDonationRequest,
  subscribeToListingRequests,
  type DonationRequest,
} from '@/lib/requests';

export interface DonorIncomingRequestsProps {
  listing: FoodListing;
  onBack: () => void;
}

export function DonorIncomingRequests({
  listing: initialListing,
  onBack,
}: DonorIncomingRequestsProps) {
  const now = useCurrentTime();
  const approvalLock = useRef(false);
  const [parentAttempt, setParentAttempt] = useState(0);
  const [live, setLive] = useState<{
    listing: FoodListing | null;
    fromCache: boolean;
    hasPendingWrites: boolean;
    error?: string;
  }>();
  const listing = live?.listing ?? initialListing;
  useEffect(() => {
    return subscribeToListing(
      initialListing.id,
      (value, metadata) => {
        setLive({
          listing: value,
          ...metadata,
          error: value ? undefined : 'This donation is no longer available.',
        });
      },
      (error) => {
        setLive({
          listing: null,
          fromCache: true,
          hasPendingWrites: false,
          error: error.message,
        });
      },
    );
  }, [initialListing.id, parentAttempt]);
  const [requests, setRequests] = useState<DonationRequest[]>([]);
  const [page, setPage] = useState<ListingPage>();
  const [cursors, setCursors] = useState<ListingPageOptions[]>([{}]);
  const [attempt, setAttempt] = useState(0);
  const options = cursors[cursors.length - 1];

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<DonationRequest | null>(
    null,
  );
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(
    null,
  );
  const listingStatus = listing.status;
  const assignedOrgUid = listing.acceptedOrganizationUid;
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Subscribe to real-time incoming requests for this listing
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;

    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setErrorMessage(null);

      stop = subscribeToListingRequests(
        listing.id,
        (items, pageMetadata) => {
          if (!active) return;
          setRequests(items);
          setPage(pageMetadata);
          setLoading(false);
        },
        (err) => {
          if (!active) return;
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Could not load incoming requests.',
          );
          setLoading(false);
        },
        options,
      );
    });

    return () => {
      active = false;
      stop?.();
    };
  }, [listing.id, options, attempt]);

  // Compute smart matching ranking
  const rankedResult = useMemo(
    () => rankListingRequests(listing, requests, now),
    [listing, requests, now],
  );

  const isAssigned = listingStatus === 'assigned';
  const isOffline = !live || live.fromCache || Boolean(page?.fromCache);
  const isPendingWrites = Boolean(
    page?.hasPendingWrites || live?.hasPendingWrites,
  );
  const approvalsBlocked =
    !live?.listing ||
    !page ||
    !!live.error ||
    !!errorMessage ||
    loading ||
    listingStatus !== 'open' ||
    !listing.pickupDeadline ||
    now.getTime() + 15 * 60000 > listing.pickupDeadline.getTime() ||
    isOffline ||
    isPendingWrites ||
    !!approvingId;

  const handleApprovePress = (request: DonationRequest) => {
    if (approvalLock.current || approvalsBlocked) return;
    const eligibility = checkRequestEligibility(listing, request, new Date());
    if (!eligibility.isEligible) {
      setErrorMessage(eligibility.reasons.join(' '));
      return;
    }
    if (isAssigned) {
      Alert.alert(
        'Listing Already Assigned',
        'This donation has already been assigned to an organization.',
      );
      return;
    }
    if (isOffline) {
      Alert.alert(
        'Offline',
        'Cannot approve requests while offline. Please connect to the internet.',
      );
      return;
    }
    if (isPendingWrites) {
      Alert.alert('Please Wait', 'Waiting for previous updates to sync.');
      return;
    }

    setConfirmRequest(request);
  };

  const handleConfirmApproval = async () => {
    if (!confirmRequest || approvalLock.current || approvalsBlocked) return;
    const target = requests.find(
      (item) => item.organizationUid === confirmRequest.organizationUid,
    );
    if (
      !target ||
      !checkRequestEligibility(listing, target, new Date()).isEligible
    ) {
      setConfirmRequest(null);
      setErrorMessage(
        'This request is no longer eligible. Refresh and review the latest requests.',
      );
      return;
    }
    approvalLock.current = true;
    setConfirmRequest(null);
    setApprovingId(target.organizationUid);
    setErrorMessage(null);

    try {
      await approveDonationRequest(listing.id, target.organizationUid);
      const recipientName = target.organizationName || target.organizationUid;
      setSuccessNotice(
        `Donation assigned to ${recipientName}. The assignment is saved and will appear in the recipient app.`,
      );
      Alert.alert(
        'Donation Assigned',
        `Successfully approved ${recipientName}. The entire donation is now assigned for pickup.`,
      );
    } catch (err) {
      const msg = accountErrorMessage(
        err,
        err instanceof Error
          ? err.message
          : 'Approval failed. Please try again.',
      );
      setErrorMessage(msg);
      Alert.alert('Approval Failed', msg);
    } finally {
      approvalLock.current = false;
      setApprovingId(null);
    }
  };

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Back Button */}
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.backButton}
        onPress={onBack}
      >
        <Text style={styles.backButtonText}>← Back to Your Donations</Text>
      </TouchableOpacity>

      {/* Listing Summary Card */}
      <View style={styles.listingCard}>
        <View style={styles.listingHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.listingTitle}>{listing.title}</Text>
            <Text style={styles.listingSubtitle}>
              {listing.quantity} {listing.unit} • Category: {listing.category}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              isAssigned ? styles.badgeAssigned : styles.badgeOpen,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isAssigned ? styles.badgeAssignedText : styles.badgeOpenText,
              ]}
            >
              {listing.pickupDeadline &&
              listing.pickupDeadline.getTime() <= now.getTime() &&
              listing.status === 'open'
                ? 'Expired'
                : listingStatus.charAt(0).toUpperCase() +
                  listingStatus.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Storage Required:</Text>
          <Text style={styles.metaValue}>
            {listing.storageRequirement.toUpperCase()}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Pickup Window:</Text>
          <Text style={styles.metaValue}>
            {formatTime(listing.pickupStartsAt)} -{' '}
            {formatDate(listing.pickupDeadline)}
          </Text>
        </View>

        {listing.pickupAddress ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Pickup Address:</Text>
            <Text style={styles.metaValue}>{listing.pickupAddress}</Text>
          </View>
        ) : null}

        {/* Urgency indicator */}
        <View style={styles.urgencyBox}>
          <Text style={styles.urgencyTitle}>Listing Urgency:</Text>
          <Text style={styles.urgencyText}>
            {rankedResult.urgency.description}
          </Text>
        </View>
      </View>

      {/* Offline / Pending Banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Offline or reconnecting. Showing cached requests. An active internet
            connection is required to approve requests.
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

      {/* Success Notification */}
      {successNotice && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{successNotice}</Text>
        </View>
      )}

      {live?.error && (
        <View>
          <AccountError message={live.error} />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setParentAttempt((v) => v + 1)}
          >
            <Text>Retry donation status</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text>
        Recommendations compare requests on this page. Current account
        eligibility is checked when approval is saved.
      </Text>
      {/* Error Banner */}
      {errorMessage && (
        <View style={styles.errorBox}>
          <AccountError message={errorMessage} />
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setAttempt((v) => v + 1)}
          >
            <Text style={styles.retryButtonText}>Retry Loading Requests</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Assigned Recipient Banner */}
      {isAssigned && assignedOrgUid && (
        <View style={styles.assignedBanner}>
          <Text style={styles.assignedBannerTitle}>Donation Assigned</Text>
          <Text style={styles.assignedBannerBody}>
            Assigned to recipient UID: {assignedOrgUid}.{'\n'}Further approvals
            are locked. The recipient can review pickup details in the app.
          </Text>
        </View>
      )}

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={donorColors.green} />
          <Text style={styles.loadingText}>Loading incoming requests...</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No requests on this page</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setCursors([{}])}
          >
            <Text>Return to first page</Text>
          </TouchableOpacity>
          <Text style={styles.emptySubtitle}>
            Verified recipient organizations browsing nearby donations will
            appear here when they submit a request.
          </Text>
        </View>
      ) : (
        <View style={styles.requestsContainer}>
          {/* Section 1: Ranked Eligible Requests */}
          {rankedResult.rankedEligible.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  Recommended Requests ({rankedResult.rankedEligible.length})
                </Text>
              </View>
              <Text style={styles.sectionNotice}>
                Ranked using Smart Matching: distance (60%) and pickup deadline
                buffer (40%). Scores are advisory; you make the final choice.
              </Text>

              {rankedResult.rankedEligible.map((item, index) => {
                const isFirst = index === 0;
                const isExpanded = expandedDetailsId === item.request.id;
                const isApproving =
                  approvingId === item.request.organizationUid;

                return (
                  <View
                    key={item.request.id}
                    style={[
                      styles.requestCard,
                      isFirst && styles.requestCardRecommended,
                    ]}
                  >
                    {/* Rank & Score Header */}
                    <View style={styles.cardTopRow}>
                      <View style={styles.rankPill}>
                        <Text style={styles.rankPillText}>
                          {isFirst ? '★ #1 Recommended' : `#${index + 1}`}
                        </Text>
                      </View>
                      <View style={styles.scorePill}>
                        <Text style={styles.scorePillText}>
                          Score: {item.breakdown.totalScore} / 100
                        </Text>
                      </View>
                    </View>

                    {/* Organization details */}
                    <Text style={styles.orgName}>
                      {item.request.organizationName ||
                        `Organization (${item.request.organizationUid})`}
                    </Text>

                    {/* Key metrics breakdown */}
                    <View style={styles.metricsGrid}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Distance</Text>
                        <Text style={styles.metricValue}>
                          {item.breakdown.distanceKm !== null
                            ? `${item.breakdown.distanceKm.toFixed(1)} km`
                            : 'Unknown'}
                        </Text>
                        <Text style={styles.metricSub}>
                          Factor score: {item.breakdown.distanceScore ?? 0}/100
                        </Text>
                      </View>

                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Proposed Pickup</Text>
                        <Text style={styles.metricValue}>
                          {formatTime(item.request.plannedPickupAt)}
                        </Text>
                        <Text style={styles.metricSub}>
                          {item.breakdown.bufferMinutes}m before deadline (
                          {item.breakdown.bufferScore}/100)
                        </Text>
                      </View>
                    </View>

                    {/* Storage confirmation */}
                    <View style={styles.storageAffirmationRow}>
                      <Text style={styles.storageAffirmationIcon}>✓</Text>
                      <Text style={styles.storageAffirmationText}>
                        Confirmed capability to meet{' '}
                        {listing.storageRequirement} storage requirement.
                      </Text>
                    </View>

                    {/* Transparent ranking explanation */}
                    <View style={styles.explanationBox}>
                      <Text style={styles.explanationSummary}>
                        {item.explanation.summary}
                      </Text>

                      <TouchableOpacity
                        accessibilityRole="button"
                        style={styles.detailsToggle}
                        onPress={() =>
                          setExpandedDetailsId(
                            isExpanded ? null : item.request.id,
                          )
                        }
                      >
                        <Text style={styles.detailsToggleText}>
                          {isExpanded
                            ? '▲ Hide Ranking Details'
                            : '▼ Show Ranking Details & Comparison'}
                        </Text>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.expandedDetails}>
                          {item.explanation.detailedLines.map((line, lIdx) => (
                            <Text key={lIdx} style={styles.detailLine}>
                              • {line}
                            </Text>
                          ))}
                          {!isFirst && (
                            <View style={styles.comparisonBox}>
                              <Text style={styles.comparisonHeader}>
                                Comparison vs #1:
                              </Text>
                              <Text style={styles.comparisonText}>
                                {explainRankingComparison(
                                  rankedResult.rankedEligible[0],
                                  item,
                                )}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.disclaimerText}>
                            {item.explanation.disclaimer}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Approval Button */}
                    {!isAssigned && (
                      <View style={styles.cardActionRow}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          disabled={approvalsBlocked}
                          style={[
                            styles.approveButton,
                            approvalsBlocked && styles.buttonDisabled,
                          ]}
                          onPress={() => handleApprovePress(item.request)}
                        >
                          {isApproving ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.approveButtonText}>
                              Approve Request
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Section 2: Manual Assessment Requests (missing coordinates) */}
          {rankedResult.manualAssessment.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Manual Assessment Required (
                {rankedResult.manualAssessment.length})
              </Text>
              <Text style={styles.sectionNotice}>
                These requests did not provide departure coordinates. Distance
                could not be computed automatically; please review pickup
                feasibility manually.
              </Text>

              {rankedResult.manualAssessment.map((item) => {
                const isApproving =
                  approvingId === item.request.organizationUid;

                return (
                  <View key={item.request.id} style={styles.requestCardManual}>
                    <View style={styles.cardTopRow}>
                      <View style={styles.manualPill}>
                        <Text style={styles.manualPillText}>
                          Manual Review Needed
                        </Text>
                      </View>
                      <View style={styles.scorePill}>
                        <Text style={styles.scorePillText}>
                          Buffer: {item.breakdown.bufferMinutes} min
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.orgName}>
                      {item.request.organizationName ||
                        `Organization (${item.request.organizationUid})`}
                    </Text>

                    <Text style={styles.manualReasonText}>
                      Reason: Departure coordinates missing. Distance score: 0
                      (advisory).
                    </Text>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Proposed Pickup:</Text>
                      <Text style={styles.metaValue}>
                        {formatTime(item.request.plannedPickupAt)} (
                        {item.breakdown.bufferMinutes}m buffer)
                      </Text>
                    </View>

                    <View style={styles.storageAffirmationRow}>
                      <Text style={styles.storageAffirmationIcon}>✓</Text>
                      <Text style={styles.storageAffirmationText}>
                        Storage confirmed ({listing.storageRequirement})
                      </Text>
                    </View>

                    {!isAssigned && (
                      <View style={styles.cardActionRow}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          disabled={approvalsBlocked}
                          style={[
                            styles.approveButton,
                            styles.approveButtonSecondary,
                            approvalsBlocked && styles.buttonDisabled,
                          ]}
                          onPress={() => handleApprovePress(item.request)}
                        >
                          {isApproving ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.approveButtonText}>
                              Approve Manually
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Section 3: Ineligible / Withdrawn Requests */}
          {rankedResult.ineligible.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitleIneligible}>
                Ineligible Requests ({rankedResult.ineligible.length})
              </Text>
              <Text style={styles.sectionNotice}>
                These requests cannot be approved because they do not satisfy
                eligibility or deadline rules.
              </Text>

              {rankedResult.ineligible.map((item) => (
                <View
                  key={item.request.id}
                  style={styles.requestCardIneligible}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.ineligiblePill}>
                      <Text style={styles.ineligiblePillText}>
                        {item.request.status === 'withdrawn'
                          ? 'Withdrawn'
                          : 'Ineligible'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.orgNameIneligible}>
                    {item.request.organizationName ||
                      `Organization (${item.request.organizationUid})`}
                  </Text>

                  {item.eligibility.reasons.map((reason, rIdx) => (
                    <Text key={rIdx} style={styles.ineligibleReason}>
                      ✕ {reason}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Pagination Controls */}
          {(cursors.length > 1 || Boolean(page?.nextCursor)) && (
            <View style={styles.paginationRow}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={loading || cursors.length === 1}
                style={[
                  styles.pageButton,
                  (loading || cursors.length === 1) &&
                    styles.pageButtonDisabled,
                ]}
                onPress={() => setCursors((v) => v.slice(0, -1))}
              >
                <Text style={styles.pageButtonText}>Previous page</Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={loading || !page?.nextCursor}
                style={[
                  styles.pageButton,
                  (loading || !page?.nextCursor) && styles.pageButtonDisabled,
                ]}
                onPress={() => {
                  if (page?.nextCursor) {
                    setCursors((v) => [...v, { after: page.nextCursor! }]);
                  }
                }}
              >
                <Text style={styles.pageButtonText}>Next page</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Confirmation Modal */}
      <Modal
        visible={Boolean(confirmRequest)}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRequest(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Donation Approval</Text>
            <Text style={styles.modalBody}>
              Are you sure you want to approve this request?
            </Text>

            {confirmRequest && (
              <View style={styles.modalDetails}>
                <Text style={styles.modalDetailRow}>
                  <Text style={styles.bold}>Recipient: </Text>
                  {confirmRequest.organizationName ||
                    confirmRequest.organizationUid}
                </Text>
                <Text style={styles.modalDetailRow}>
                  <Text style={styles.bold}>Quantity: </Text>
                  {listing.quantity} {listing.unit} (Whole listing)
                </Text>
                <Text style={styles.modalDetailRow}>
                  <Text style={styles.bold}>Proposed Pickup: </Text>
                  {formatTime(confirmRequest.plannedPickupAt)}
                </Text>
              </View>
            )}

            <Text style={styles.modalWarning}>
              Important: Approval atomically assigns the entire donation to this
              organization. Other pending requests will no longer be eligible to
              receive this listing.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setConfirmRequest(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                accessibilityRole="button"
                disabled={approvalsBlocked}
                onPress={handleConfirmApproval}
              >
                <Text style={styles.modalConfirmText}>Confirm & Assign</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  backButton: {
    marginBottom: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: donorColors.green,
    fontSize: 15,
    fontWeight: '700',
  },
  listingCard: {
    backgroundColor: donorColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: donorColors.border,
    marginBottom: 16,
    gap: 8,
  },
  listingHeader: {
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeOpen: {
    backgroundColor: '#dcfce7',
  },
  badgeOpenText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 12,
  },
  badgeAssigned: {
    backgroundColor: '#dbeafe',
  },
  badgeAssignedText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
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
  urgencyBox: {
    marginTop: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#d97706',
  },
  urgencyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    textTransform: 'uppercase',
  },
  urgencyText: {
    fontSize: 13,
    color: '#78350f',
    marginTop: 2,
  },
  offlineBanner: {
    backgroundColor: '#ffedd5',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
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
    marginBottom: 12,
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
    marginBottom: 14,
  },
  successText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
  },
  errorBox: {
    marginBottom: 14,
    gap: 8,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: donorColors.lightGreen,
    borderRadius: 8,
  },
  retryButtonText: {
    color: donorColors.green,
    fontWeight: '600',
    fontSize: 13,
  },
  assignedBanner: {
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  assignedBannerTitle: {
    color: '#3730a3',
    fontWeight: '700',
    fontSize: 15,
  },
  assignedBannerBody: {
    color: '#4338ca',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: donorColors.secondary,
  },
  emptyContainer: {
    backgroundColor: donorColors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: donorColors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: donorColors.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: donorColors.secondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  requestsContainer: {
    gap: 20,
  },
  section: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: donorColors.text,
  },
  sectionTitleIneligible: {
    fontSize: 15,
    fontWeight: '700',
    color: donorColors.secondary,
  },
  sectionNotice: {
    fontSize: 12,
    color: donorColors.secondary,
    lineHeight: 17,
  },
  requestCard: {
    backgroundColor: donorColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: donorColors.border,
    gap: 10,
  },
  requestCardRecommended: {
    borderColor: donorColors.green,
    borderWidth: 2,
    backgroundColor: '#ffffff',
  },
  requestCardManual: {
    backgroundColor: donorColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fed7aa',
    gap: 10,
  },
  requestCardIneligible: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rankPill: {
    backgroundColor: donorColors.lightGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rankPillText: {
    color: donorColors.green,
    fontWeight: '800',
    fontSize: 12,
  },
  scorePill: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scorePillText: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 12,
  },
  manualPill: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  manualPillText: {
    color: '#c2410c',
    fontWeight: '700',
    fontSize: 12,
  },
  ineligiblePill: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ineligiblePillText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 11,
  },
  orgName: {
    fontSize: 17,
    fontWeight: '700',
    color: donorColors.text,
  },
  orgNameIneligible: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: donorColors.background,
    borderRadius: 10,
    padding: 10,
  },
  metricItem: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: donorColors.secondary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: donorColors.text,
  },
  metricSub: {
    fontSize: 11,
    color: donorColors.secondary,
  },
  storageAffirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storageAffirmationIcon: {
    color: donorColors.green,
    fontSize: 14,
    fontWeight: '900',
  },
  storageAffirmationText: {
    fontSize: 13,
    color: donorColors.text,
    fontWeight: '500',
  },
  explanationBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  explanationSummary: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  detailsToggle: {
    paddingVertical: 4,
  },
  detailsToggleText: {
    fontSize: 12,
    color: donorColors.green,
    fontWeight: '700',
  },
  expandedDetails: {
    marginTop: 6,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  detailLine: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  comparisonBox: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
  },
  comparisonHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  comparisonText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 6,
  },
  manualReasonText: {
    fontSize: 13,
    color: '#c2410c',
  },
  ineligibleReason: {
    fontSize: 12,
    color: donorColors.danger,
    lineHeight: 16,
  },
  cardActionRow: {
    marginTop: 4,
  },
  approveButton: {
    backgroundColor: donorColors.green,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButtonSecondary: {
    backgroundColor: '#0284c7',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  approveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  pageButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: donorColors.surface,
    borderColor: donorColors.border,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    color: donorColors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: donorColors.text,
  },
  modalBody: {
    fontSize: 14,
    color: donorColors.secondary,
    lineHeight: 20,
  },
  modalDetails: {
    backgroundColor: donorColors.background,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  modalDetailRow: {
    fontSize: 13,
    color: donorColors.text,
  },
  bold: {
    fontWeight: '700',
  },
  modalWarning: {
    fontSize: 12,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 8,
    lineHeight: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalCancelText: {
    color: donorColors.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmButton: {
    backgroundColor: donorColors.green,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  modalConfirmText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

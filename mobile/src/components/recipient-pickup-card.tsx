import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCurrentTime } from '../hooks/use-current-time';
import type { FoodListing } from '../lib/listings';
import {
  cancelApprovedDonation,
  clearPickupHandover,
  confirmPickupHandover,
  reconcileExpiredListing,
} from '../lib/pickup';
import type { DonationRequest } from '../lib/requests';
import {
  formatDateText,
  formatSecondsCountdown,
  formatTimeSpan,
  getPickupQrPayload,
  getRecipientPickupTiming,
} from '../lib/request-validation';
import { QrCodeView } from './qr-code-view';

interface RecipientPickupCardProps {
  listing: FoodListing;
  request: DonationRequest;
  currentUid: string;
  isOffline?: boolean;
  hasPendingWrites?: boolean;
  onStatusChange?: () => void;
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
  text: '#152A20',
  secondary: '#4B6255',
  surface: '#FFFFFF',
  border: '#C8DAD0',
};

export function RecipientPickupCard({
  listing,
  request,
  currentUid,
  isOffline = false,
  hasPendingWrites = false,
  onStatusChange,
}: RecipientPickupCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const now = useCurrentTime();
  const timing = getRecipientPickupTiming(listing, request, now);
  const qrPayload = getPickupQrPayload(listing.id);

  const isCollected =
    listing.status === 'collected' || request.status === 'collected';
  const isCancelled =
    listing.status === 'cancelled' || request.status === 'cancelled';
  const isExpired =
    listing.status === 'expired' || request.status === 'expired';

  // 1. Confirm Handover Action
  const handleConfirmHandover = async () => {
    if (submitting || isOffline || hasPendingWrites) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      await confirmPickupHandover(listing.id, currentUid);
      onStatusChange?.();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not confirm handover. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Clear / Retract Handover Confirmation
  const handleClearHandover = async () => {
    if (submitting || isOffline || hasPendingWrites) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      await clearPickupHandover(listing.id, currentUid);
      onStatusChange?.();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not retract confirmation.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Cancel / Release Assignment
  const handleCancelAssignment = () => {
    if (submitting || isOffline || hasPendingWrites) return;

    const willReopen = timing.cancellationEffect === 'open';
    const alertMessage = willReopen
      ? 'At least 15 minutes remain before the deadline. Releasing this assignment will reopen the listing for other organizations. Your request will be cancelled and cannot be resubmitted.'
      : 'Less than 15 minutes remain before the deadline. Cancelling now will permanently cancel this listing. Your request will be cancelled.';

    Alert.alert(
      willReopen ? 'Release Assignment?' : 'Cancel Assignment?',
      alertMessage,
      [
        { text: 'Keep Assignment', style: 'cancel' },
        {
          text: willReopen ? 'Release & Reopen' : 'Cancel Listing',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            setErrorMessage('');
            try {
              await cancelApprovedDonation(listing.id, currentUid, 'release');
              onStatusChange?.();
            } catch (err: unknown) {
              setErrorMessage(
                err instanceof Error
                  ? err.message
                  : 'Could not release assignment.',
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  // 4. Reconcile Expired Donation
  const handleReconcileExpiry = async () => {
    if (submitting || isOffline || hasPendingWrites) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      await reconcileExpiredListing(listing.id);
      onStatusChange?.();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not reconcile expiry.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Render Collection Completed State
  if (isCollected) {
    return (
      <View style={[styles.card, styles.collectedCard]}>
        <View style={styles.badgeCollected}>
          <Text style={styles.badgeCollectedText}>Donation Collected</Text>
        </View>
        <Text accessibilityRole="header" style={styles.collectedTitle}>
          Collection Complete!
        </Text>
        <Text style={styles.collectedSubtitle}>
          This whole donation was successfully collected from{' '}
          {listing.providerName}.
        </Text>

        <View style={styles.receiptBox}>
          <Text style={styles.receiptHeader}>HANDOVER SUMMARY</Text>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Item:</Text>
            <Text style={styles.receiptValue}>{listing.title}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Quantity:</Text>
            <Text style={styles.receiptValue}>
              {listing.quantity} {listing.unit}
            </Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Donor:</Text>
            <Text style={styles.receiptValue}>{listing.providerName}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Pickup Location:</Text>
            <Text style={styles.receiptValue}>{listing.pickupAddress}</Text>
          </View>
          {request.recipientConfirmedAt && (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Confirmed Handover:</Text>
              <Text style={styles.receiptValue}>
                {formatDateText(request.recipientConfirmedAt)}
              </Text>
            </View>
          )}
          {listing.collectedAt && (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Collected At:</Text>
              <Text style={styles.receiptValue}>
                {formatDateText(listing.collectedAt)}
              </Text>
            </View>
          )}
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Reference ID:</Text>
            <Text style={styles.receiptValue}>{listing.id}</Text>
          </View>
        </View>
      </View>
    );
  }

  // Render Cancelled State
  if (isCancelled) {
    return (
      <View style={[styles.card, styles.cancelledCard]}>
        <View style={styles.badgeCancelled}>
          <Text style={styles.badgeCancelledText}>Assignment Cancelled</Text>
        </View>
        <Text accessibilityRole="header" style={styles.cancelledTitle}>
          This assignment was cancelled.
        </Text>
        <Text style={styles.cancelledText}>
          The assignment has been released or closed. Requests on this listing
          are no longer active.
        </Text>
      </View>
    );
  }

  // Render Expired State
  if (isExpired) {
    return (
      <View style={[styles.card, styles.expiredCard]}>
        <View style={styles.badgeExpired}>
          <Text style={styles.badgeExpiredText}>Pickup Expired</Text>
        </View>
        <Text accessibilityRole="header" style={styles.expiredTitle}>
          Pickup Deadline Has Passed
        </Text>
        <Text style={styles.expiredText}>
          The pickup window ended on {formatDateText(listing.pickupDeadline)}.
          Collection can no longer take place.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Offline / Pending Banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Showing saved pickup details. Reconnect to confirm handover.
          </Text>
        </View>
      )}

      {hasPendingWrites && (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color={colors.amber} />
          <Text style={styles.syncText}>Syncing changes with server…</Text>
        </View>
      )}

      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.badgeApproved}>
          <Text style={styles.badgeApprovedText}>
            Assigned to Your Organization
          </Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Pickup & Handover
        </Text>
        <Text style={styles.instructions}>
          Meet the donor at {listing.pickupAddress}. Present your QR code and
          confirm handover inside your app.
        </Text>
      </View>

      {/* Timing Status Banner */}
      {timing.windowStatus === 'before_start' && (
        <View style={styles.timingBannerWarning}>
          <Text style={styles.timingBannerTextWarning}>
            Pickup window opens in {formatTimeSpan(timing.secondsUntilStart)} (
            {formatDateText(listing.pickupStartsAt)}).
          </Text>
        </View>
      )}

      {timing.windowStatus === 'active' && (
        <View style={styles.timingBannerSuccess}>
          <Text style={styles.timingBannerTextSuccess}>
            Pickup is active! {formatTimeSpan(timing.remainingWindowSeconds)}{' '}
            remaining until deadline.
          </Text>
        </View>
      )}

      {timing.windowStatus === 'elapsed' && (
        <View style={styles.timingBannerDanger}>
          <Text style={styles.timingBannerTextDanger}>
            Pickup deadline has elapsed (
            {formatDateText(listing.pickupDeadline)}).
          </Text>
        </View>
      )}

      {/* Visual QR Code Reference */}
      <QrCodeView
        reference={qrPayload.reference}
        rawPayload={qrPayload.raw}
        size={190}
      />

      {/* Handover Confirmation Interaction */}
      <View style={styles.handoverSection}>
        <Text style={styles.sectionHeader}>Handover Confirmation</Text>

        {timing.confirmationStatus === 'confirmed_valid' ? (
          <View style={styles.confirmedBox}>
            <View style={styles.confirmedHeaderRow}>
              <View style={styles.confirmedPill}>
                <Text style={styles.confirmedPillText}>
                  ✓ Handover Confirmed
                </Text>
              </View>
              <Text style={styles.countdownTimer}>
                ⏱ {formatSecondsCountdown(timing.remainingConfirmationSeconds)}
              </Text>
            </View>

            <Text style={styles.confirmedTimeText}>
              Confirmed at {formatDateText(request.recipientConfirmedAt)}
            </Text>
            <Text style={styles.confirmedExplanation}>
              The donor now has up to 5 minutes to complete collection on their
              phone.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting || isOffline }}
              disabled={submitting || isOffline}
              style={({ pressed }) => [
                styles.retractButton,
                pressed && styles.buttonPressed,
                (submitting || isOffline) && styles.buttonDisabled,
              ]}
              onPress={handleClearHandover}
            >
              <Text style={styles.retractButtonText}>
                {submitting ? 'Retracting…' : 'Clear Confirmation'}
              </Text>
            </Pressable>
          </View>
        ) : timing.confirmationStatus === 'confirmed_stale' ? (
          <View style={styles.staleBox}>
            <Text style={styles.staleTitle}>Confirmation Window Expired</Text>
            <Text style={styles.staleText}>
              More than 5 minutes have passed since your previous confirmation,
              and the donor has not completed collection. Please confirm
              handover again when ready.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: submitting || isOffline || !timing.canConfirmHandover,
              }}
              disabled={submitting || isOffline || !timing.canConfirmHandover}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                (submitting || isOffline || !timing.canConfirmHandover) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleConfirmHandover}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Reconfirming…' : 'Reconfirm Handover'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.unconfirmedBox}>
            <Text style={styles.unconfirmedText}>
              Once at the pickup location with the donor, confirm handover to
              start the 5-minute collection window.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: submitting || isOffline || !timing.canConfirmHandover,
              }}
              disabled={submitting || isOffline || !timing.canConfirmHandover}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                (submitting || isOffline || !timing.canConfirmHandover) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleConfirmHandover}
            >
              {submitting ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Confirming…</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>
                  {timing.windowStatus === 'before_start'
                    ? 'Confirm Handover (Opens at start)'
                    : timing.windowStatus === 'elapsed'
                      ? 'Pickup Window Elapsed'
                      : 'Confirm Handover'}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>

      {/* Error Feedback */}
      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Actions: Expiry Reconciliation or Release Assignment */}
      <View style={styles.footerActions}>
        {timing.canReconcileExpiry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting || isOffline }}
            disabled={submitting || isOffline}
            style={({ pressed }) => [
              styles.reconcileButton,
              pressed && styles.buttonPressed,
              (submitting || isOffline) && styles.buttonDisabled,
            ]}
            onPress={handleReconcileExpiry}
          >
            <Text style={styles.reconcileButtonText}>
              {submitting ? 'Reconciling…' : 'Reconcile Expired Donation'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting || isOffline }}
            disabled={submitting || isOffline}
            style={({ pressed }) => [
              styles.releaseButton,
              pressed && styles.buttonPressed,
              (submitting || isOffline) && styles.buttonDisabled,
            ]}
            onPress={handleCancelAssignment}
          >
            <Text style={styles.releaseButtonText}>
              {timing.cancellationEffect === 'open'
                ? 'Release Assignment (Reopens for others)'
                : 'Cancel Assignment'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginTop: 16,
  },
  collectedCard: {
    borderColor: colors.blueBorder,
    backgroundColor: '#F0F9FF',
  },
  cancelledCard: {
    borderColor: colors.redBorder,
    backgroundColor: colors.redBg,
  },
  expiredCard: {
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
  },
  offlineBanner: {
    backgroundColor: colors.amberBg,
    borderColor: colors.amberBorder,
    borderWidth: 1,
    padding: 8,
    borderRadius: 8,
  },
  offlineText: {
    fontSize: 12,
    color: colors.amber,
    textAlign: 'center',
    fontWeight: '600',
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  syncText: {
    fontSize: 12,
    color: colors.amber,
    fontWeight: '600',
  },
  header: {
    gap: 6,
  },
  badgeApproved: {
    alignSelf: 'flex-start',
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeApprovedText: {
    color: colors.greenText,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  instructions: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
  },
  timingBannerWarning: {
    backgroundColor: colors.amberBg,
    borderColor: colors.amberBorder,
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
  },
  timingBannerTextWarning: {
    color: colors.amber,
    fontSize: 13,
    fontWeight: '600',
  },
  timingBannerSuccess: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
  },
  timingBannerTextSuccess: {
    color: colors.greenText,
    fontSize: 13,
    fontWeight: '600',
  },
  timingBannerDanger: {
    backgroundColor: colors.redBg,
    borderColor: colors.redBorder,
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
  },
  timingBannerTextDanger: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '600',
  },
  handoverSection: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  confirmedBox: {
    backgroundColor: colors.greenBg,
    borderColor: colors.greenBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  confirmedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmedPill: {
    backgroundColor: colors.green,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confirmedPillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  countdownTimer: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.greenText,
  },
  confirmedTimeText: {
    fontSize: 12,
    color: colors.greenText,
  },
  confirmedExplanation: {
    fontSize: 13,
    color: colors.greenText,
    lineHeight: 18,
  },
  retractButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: colors.redBorder,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  retractButtonText: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '600',
  },
  staleBox: {
    backgroundColor: colors.amberBg,
    borderColor: colors.amberBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  staleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.amber,
  },
  staleText: {
    fontSize: 13,
    color: colors.amber,
    lineHeight: 18,
  },
  unconfirmedBox: {
    gap: 10,
  },
  unconfirmedText: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: colors.green,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorBox: {
    backgroundColor: colors.redBg,
    borderColor: colors.redBorder,
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
  },
  footerActions: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
  },
  releaseButton: {
    borderColor: colors.redBorder,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  releaseButtonText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '600',
  },
  reconcileButton: {
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  reconcileButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  // Collected / Receipt styles
  badgeCollected: {
    alignSelf: 'flex-start',
    backgroundColor: colors.blue,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeCollectedText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  collectedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.blue,
  },
  collectedSubtitle: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
  },
  receiptBox: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.blueBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 6,
  },
  receiptHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.blue,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  receiptLabel: {
    fontSize: 13,
    color: colors.secondary,
    fontWeight: '500',
  },
  receiptValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  // Cancelled / Expired styles
  badgeCancelled: {
    alignSelf: 'flex-start',
    backgroundColor: colors.red,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeCancelledText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelledTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.red,
  },
  cancelledText: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
  },
  badgeExpired: {
    alignSelf: 'flex-start',
    backgroundColor: '#64748B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeExpiredText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  expiredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
  },
  expiredText: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
  },
});

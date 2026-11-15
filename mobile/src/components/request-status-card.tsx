import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { FoodListing } from '../lib/listings';
import type { DonationRequest } from '../lib/requests';
import { deriveRequestState, formatDateText } from '../lib/request-validation';

interface RequestStatusCardProps {
  listing: FoodListing;
  request: DonationRequest;
  currentUid: string;
  isOffline?: boolean;
  hasPendingWrites?: boolean;
  onWithdraw: () => Promise<void>;
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
};

export function RequestStatusCard({
  listing,
  request,
  currentUid,
  isOffline = false,
  hasPendingWrites = false,
  onWithdraw,
}: RequestStatusCardProps) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  const derived = deriveRequestState(request, listing, currentUid);

  const confirmWithdrawal = () => {
    Alert.alert(
      'Withdraw Request?',
      'Are you sure you want to withdraw your request for this whole donation? Under FoodRescue rules, you cannot resubmit a request for this listing once withdrawn.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(true);
            setWithdrawError('');
            try {
              await onWithdraw();
            } catch (err: unknown) {
              setWithdrawError(
                err instanceof Error
                  ? err.message
                  : 'Could not withdraw your request. Check your connection.',
              );
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ],
    );
  };

  const getToneStyle = () => {
    switch (derived.tone) {
      case 'success':
        return {
          bg: colors.greenBg,
          border: colors.greenBorder,
          text: colors.greenText,
        };
      case 'warning':
        return {
          bg: colors.amberBg,
          border: colors.amberBorder,
          text: colors.amber,
        };
      case 'error':
        return {
          bg: colors.redBg,
          border: colors.redBorder,
          text: colors.red,
        };
      case 'info':
        return {
          bg: colors.blueBg,
          border: colors.blueBorder,
          text: colors.blue,
        };
      default:
        return {
          bg: colors.neutralBg,
          border: colors.neutralBorder,
          text: colors.neutralText,
        };
    }
  };

  const tone = getToneStyle();

  return (
    <View style={[styles.card, { borderColor: tone.border }]}>
      {/* Badge & Title */}
      <View style={styles.headerRow}>
        <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusBadgeText, { color: tone.text }]}>
            {derived.label}
          </Text>
        </View>
        {isOffline && (
          <View style={styles.cachedBadge}>
            <Text style={styles.cachedBadgeText}>Offline (Cached)</Text>
          </View>
        )}
      </View>

      <Text style={styles.description}>{derived.description}</Text>

      {/* Details Box */}
      <View style={styles.detailsBox}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Proposed Pickup:</Text>
          <Text style={styles.detailValue}>
            {formatDateText(request.plannedPickupAt)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Storage Capacity:</Text>
          <Text style={styles.detailValue}>
            Confirmed {listing.storageRequirement} storage
          </Text>
        </View>
        {request.departureLocation && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Departure Coordinates:</Text>
            <Text style={styles.detailValue}>
              {request.departureLocation.latitude.toFixed(4)},{' '}
              {request.departureLocation.longitude.toFixed(4)}
            </Text>
          </View>
        )}
        {request.createdAt && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Submitted At:</Text>
            <Text style={styles.detailValue}>
              {formatDateText(request.createdAt)}
            </Text>
          </View>
        )}
      </View>

      {/* Approved Next Steps Notice */}
      {derived.status === 'approved' && (
        <View style={styles.nextStepsBox}>
          <Text style={styles.nextStepsTitle}>Pickup Handover (Phase 4):</Text>
          <Text style={styles.nextStepsText}>
            Keep in touch with the donor. When you arrive at{' '}
            {listing.pickupAddress} during the pickup window, you will present
            your organization QR reference and confirm handover.
          </Text>
        </View>
      )}

      {/* Syncing indicator */}
      {hasPendingWrites && (
        <View style={styles.syncBox}>
          <ActivityIndicator size="small" color={colors.amber} />
          <Text style={styles.syncText}>Syncing changes with server…</Text>
        </View>
      )}

      {/* Withdrawal error */}
      {withdrawError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{withdrawError}</Text>
        </View>
      ) : null}

      {/* Withdrawal Action Button */}
      {derived.canWithdraw && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: withdrawing }}
          disabled={withdrawing}
          onPress={confirmWithdrawal}
          style={({ pressed }) => [
            styles.withdrawButton,
            pressed && styles.withdrawButtonPressed,
            withdrawing && styles.withdrawButtonDisabled,
          ]}
        >
          {withdrawing ? (
            <View style={styles.buttonLoading}>
              <ActivityIndicator size="small" color={colors.red} />
              <Text style={styles.withdrawButtonText}>Withdrawing…</Text>
            </View>
          ) : (
            <Text style={styles.withdrawButtonText}>Withdraw Request</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cachedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cachedBadgeText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  detailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.secondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  nextStepsBox: {
    backgroundColor: colors.greenBg,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.greenBorder,
  },
  nextStepsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.greenText,
  },
  nextStepsText: {
    fontSize: 13,
    color: colors.greenText,
    lineHeight: 18,
  },
  syncBox: {
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
  errorBox: {
    backgroundColor: colors.redBg,
    borderColor: colors.redBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
  },
  withdrawButton: {
    borderColor: colors.redBorder,
    borderWidth: 1,
    backgroundColor: colors.redBg,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawButtonPressed: {
    opacity: 0.8,
  },
  withdrawButtonDisabled: {
    opacity: 0.5,
  },
  withdrawButtonText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

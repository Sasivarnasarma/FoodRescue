import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  encodePickupQrPayload,
  generateQrMatrix,
  type QrMatrix,
} from '../lib/qr-service';
import {
  getPickupCountdown,
  isPickupReminderSet,
  setPickupReminder,
  type PickupCountdownInfo,
} from '../lib/pickup-reminders';

export interface QrDisplayCardProps {
  listingId: string;
  listingTitle?: string;
  pickupStartsAt?: Date | null;
  pickupDeadline?: Date | null;
  recipientConfirmed?: boolean;
  size?: number;
}

export function QrDisplayCard({
  listingId,
  listingTitle,
  pickupStartsAt,
  pickupDeadline,
  recipientConfirmed = false,
  size = 220,
}: QrDisplayCardProps) {
  const [copied, setCopied] = useState(false);
  const [reminderActive, setReminderActive] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Refresh clock every 10 seconds for timely window guidance
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  // Check stored reminder state
  useEffect(() => {
    let active = true;
    void isPickupReminderSet(listingId).then((enabled) => {
      if (active) setReminderActive(enabled);
    });
    return () => {
      active = false;
    };
  }, [listingId]);

  const startsMillis = pickupStartsAt ? pickupStartsAt.getTime() : 0;
  const deadlineMillis = pickupDeadline ? pickupDeadline.getTime() : 0;

  const countdown: PickupCountdownInfo = useMemo(() => {
    return getPickupCountdown(startsMillis, deadlineMillis, now);
  }, [startsMillis, deadlineMillis, now]);

  const qrMatrix: QrMatrix | null = useMemo(() => {
    try {
      const payload = encodePickupQrPayload(listingId);
      return generateQrMatrix(payload);
    } catch {
      return null;
    }
  }, [listingId]);

  const handleCopyReference = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleToggleReminder = async () => {
    setReminderBusy(true);
    try {
      const next = !reminderActive;
      await setPickupReminder(listingId, next);
      setReminderActive(next);
    } finally {
      setReminderBusy(false);
    }
  };

  const cellSize = qrMatrix ? Math.floor(size / qrMatrix.size) : 8;
  const actualGridSize = qrMatrix ? cellSize * qrMatrix.size : size;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.header}>
        Pickup QR Reference
      </Text>
      <Text style={styles.caption}>
        Present this code to the donor at collection. If scanning is
        unavailable, provide the Reference ID below.
      </Text>

      {/* Countdown and timing status badge */}
      {startsMillis && deadlineMillis ? (
        <View
          style={[
            styles.timingBadge,
            countdown.phase === 'active' && styles.timingBadgeActive,
            countdown.phase === 'expiring_soon' && styles.timingBadgeUrgent,
            countdown.phase === 'upcoming' && styles.timingBadgeUpcoming,
            countdown.phase === 'expired' && styles.timingBadgeExpired,
          ]}
        >
          <Text
            style={[
              styles.timingBadgeText,
              countdown.phase === 'expiring_soon' && styles.timingTextUrgent,
            ]}
          >
            {countdown.formatted}
          </Text>
        </View>
      ) : null}

      {/* Handover confirmation indicator */}
      <View
        style={[
          styles.confirmationBox,
          recipientConfirmed
            ? styles.confirmationConfirmed
            : styles.confirmationPending,
        ]}
      >
        <Text style={styles.confirmationTitle}>
          {recipientConfirmed
            ? '✓ Handover Confirmed by You'
            : '⏳ Awaiting Your Handover Confirmation'}
        </Text>
        <Text style={styles.confirmationBody}>
          {recipientConfirmed
            ? 'Your signed-in confirmation is recorded. The donor has up to 5 minutes to complete collection.'
            : 'You must confirm handover in your signed-in app when meeting the donor inside the pickup window.'}
        </Text>
      </View>

      {/* QR Code Matrix Visual */}
      <View style={styles.qrWrapper}>
        {qrMatrix ? (
          <View
            style={[
              styles.qrContainer,
              { width: actualGridSize + 16, height: actualGridSize + 16 },
            ]}
            accessibilityLabel={`Pickup QR code for ${listingTitle || listingId}`}
          >
            {qrMatrix.modules.map((row, r) => (
              <View key={`row-${r}`} style={styles.qrRow}>
                {row.map((cell, c) => (
                  <View
                    key={`cell-${r}-${c}`}
                    style={[
                      styles.qrCell,
                      {
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: cell ? '#0f172a' : '#ffffff',
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.qrContainer, { width: size, height: size }]}>
            <Text style={styles.errorText}>Could not render QR code.</Text>
          </View>
        )}
      </View>

      {/* Monospace Reference ID and Fallback */}
      <View style={styles.referenceContainer}>
        <Text style={styles.referenceLabel}>MANUAL REFERENCE ID</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Copy pickup reference ID ${listingId}`}
          onPress={handleCopyReference}
          style={styles.referenceBox}
        >
          <Text style={styles.referenceCode}>{listingId}</Text>
          <Text style={styles.copyHint}>
            {copied ? '✓ Reference noted' : 'Tap to copy reference'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Optional Local Reminder Toggle */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={
          reminderActive ? 'Remove pickup reminder' : 'Set pickup reminder'
        }
        disabled={reminderBusy}
        onPress={() => void handleToggleReminder()}
        style={[
          styles.reminderButton,
          reminderActive && styles.reminderButtonActive,
        ]}
      >
        {reminderBusy ? (
          <ActivityIndicator size="small" color="#167044" />
        ) : (
          <Text
            style={[
              styles.reminderButtonText,
              reminderActive && styles.reminderButtonTextActive,
            ]}
          >
            {reminderActive
              ? '🔔 Pickup Reminder Active'
              : '🔔 Set In-App Pickup Reminder'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 14,
    alignItems: 'center',
    width: '100%',
  },
  header: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  caption: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  timingBadge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  timingBadgeActive: {
    backgroundColor: '#dcfce7',
  },
  timingBadgeUrgent: {
    backgroundColor: '#fee2e2',
  },
  timingBadgeUpcoming: {
    backgroundColor: '#eff6ff',
  },
  timingBadgeExpired: {
    backgroundColor: '#f3f4f6',
  },
  timingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  timingTextUrgent: {
    color: '#b91c1c',
  },
  confirmationBox: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  confirmationConfirmed: {
    backgroundColor: '#ecfdf5',
    borderColor: '#6ee7b7',
  },
  confirmationPending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  confirmationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  confirmationBody: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  qrWrapper: {
    padding: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qrContainer: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  qrRow: {
    flexDirection: 'row',
  },
  qrCell: {
    // dimensioned inline
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  referenceContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  referenceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.6,
  },
  referenceBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%',
  },
  referenceCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 1,
  },
  copyHint: {
    fontSize: 11,
    color: '#0284c7',
    marginTop: 2,
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    width: '100%',
    minHeight: 44,
  },
  reminderButtonActive: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  reminderButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  reminderButtonTextActive: {
    color: '#15803d',
    fontWeight: '700',
  },
});

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Coordinates, FoodListing } from '../lib/listings';
import { submitDonationRequest } from '../lib/requests';
import { localDateText, parseLocalDate } from '../lib/listing-form-validation';
import {
  validateDepartureLocation,
  validatePickupProposal,
  validateStorageConfirmation,
} from '../lib/request-validation';

interface RequestFormProps {
  listing: FoodListing;
  departureLocation: Coordinates | null;
  onSuccess?: () => void;
}

const colors = {
  green: '#167044',
  greenSurface: '#E5F4EB',
  greenText: '#0E482C',
  amber: '#FFF4D4',
  amberText: '#704716',
  amberBorder: '#E0C875',
  red: '#FCEBEC',
  redText: '#952D33',
  redBorder: '#E4A4A8',
  text: '#152A20',
  secondary: '#4B6255',
  border: '#C8DAD0',
  surface: '#FFFFFF',
  surfaceSubtle: '#F4F8F5',
};

export function RequestForm({
  listing,
  departureLocation,
  onSuccess,
}: RequestFormProps) {
  // Compute initial proposed pickup time
  const [proposedText, setProposedText] = useState(() => {
    const now = Date.now();
    const startMillis = listing.pickupStartsAt?.getTime() ?? now;
    const deadlineMillis = listing.pickupDeadline?.getTime() ?? now + 3600000;

    let targetMillis = Math.max(startMillis, now + 15 * 60 * 1000);
    // If target is beyond deadline or within 15 min of deadline, set to 20 min before deadline
    if (targetMillis >= deadlineMillis - 15 * 60 * 1000) {
      targetMillis = Math.max(now + 60000, deadlineMillis - 20 * 60 * 1000);
    }
    return localDateText(new Date(targetMillis));
  });

  const [confirmedStorage, setConfirmedStorage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const setQuickTime = (type: 'start' | 'mid' | 'beforeDeadline') => {
    const now = Date.now();
    const startMillis = listing.pickupStartsAt?.getTime() ?? now;
    const deadlineMillis = listing.pickupDeadline?.getTime() ?? now + 3600000;

    let chosenMillis = now;
    if (type === 'start') {
      chosenMillis = Math.max(startMillis, now + 5 * 60 * 1000);
    } else if (type === 'mid') {
      const windowStart = Math.max(startMillis, now);
      chosenMillis = windowStart + (deadlineMillis - windowStart) / 2;
    } else {
      chosenMillis = deadlineMillis - 30 * 60 * 1000; // 30 mins before deadline
    }

    if (chosenMillis <= now) chosenMillis = now + 10 * 60 * 1000;
    setProposedText(localDateText(new Date(chosenMillis)));
    setErrorMessage('');
  };

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    setErrorMessage('');

    // 1. Parse date
    let proposedDate: Date;
    try {
      proposedDate = parseLocalDate(proposedText);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Enter a valid date in YYYY-MM-DD HH:mm format.',
      );
      return;
    }

    // 2. Validate pickup proposal time
    const proposalCheck = validatePickupProposal(
      proposedDate,
      listing.pickupStartsAt,
      listing.pickupDeadline,
    );
    if (!proposalCheck.valid) {
      setErrorMessage(proposalCheck.error ?? 'Invalid pickup time.');
      return;
    }

    // 3. Validate storage confirmation
    const storageCheck = validateStorageConfirmation(confirmedStorage);
    if (!storageCheck.valid) {
      setErrorMessage(storageCheck.error ?? 'Storage confirmation required.');
      return;
    }

    // 4. Validate departure location if present
    const locationCheck = validateDepartureLocation(departureLocation);
    if (!locationCheck.valid) {
      setErrorMessage(locationCheck.error ?? 'Invalid departure location.');
      return;
    }

    setSubmitting(true);
    try {
      await submitDonationRequest({
        listingId: listing.id,
        plannedPickupAt: proposedDate,
        canMeetStorageRequirement: true,
        departureLocation: departureLocation ?? undefined,
      });
      setSubmitted(true);
      onSuccess?.();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not submit your request. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Request This Whole Donation
      </Text>
      <Text style={styles.subtitle}>
        Whole-listing allocation: You are requesting all {listing.quantity}{' '}
        {listing.unit} of {listing.title}. Donors review requests and approve
        one organization.
      </Text>

      {/* Pickup proposal section */}
      <View style={styles.fieldSection}>
        <Text style={styles.label}>Proposed Pickup Date & Time</Text>
        <Text style={styles.hint}>
          Pickup window: {localDateText(listing.pickupStartsAt)} to{' '}
          {localDateText(listing.pickupDeadline)} (local time)
        </Text>
        <TextInput
          accessibilityLabel="Proposed pickup date and time"
          style={styles.input}
          value={proposedText}
          onChangeText={(val) => {
            setProposedText(val);
            if (errorMessage) setErrorMessage('');
          }}
          placeholder="YYYY-MM-DD HH:mm"
          placeholderTextColor={colors.secondary}
          editable={!submitting && !submitted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Quick select buttons */}
        <View style={styles.quickButtonsRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.quickButton}
            onPress={() => setQuickTime('start')}
            disabled={submitting || submitted}
          >
            <Text style={styles.quickButtonText}>At Start</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.quickButton}
            onPress={() => setQuickTime('mid')}
            disabled={submitting || submitted}
          >
            <Text style={styles.quickButtonText}>Mid Window</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.quickButton}
            onPress={() => setQuickTime('beforeDeadline')}
            disabled={submitting || submitted}
          >
            <Text style={styles.quickButtonText}>30m Before End</Text>
          </Pressable>
        </View>
      </View>

      {/* Storage requirement affirmation */}
      <View style={styles.storageBox}>
        <Text style={styles.storageHeader}>
          {listing.storageRequirement.toUpperCase()} STORAGE REQUIRED
        </Text>
        <Text style={styles.storageInstructions}>
          {listing.storageInstructions ||
            'Follow standard food safety storage procedures.'}
        </Text>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmedStorage }}
          style={styles.checkboxRow}
          onPress={() => {
            if (!submitting && !submitted) {
              setConfirmedStorage((c) => !c);
              if (errorMessage) setErrorMessage('');
            }
          }}
        >
          <View
            style={[
              styles.checkbox,
              confirmedStorage && styles.checkboxChecked,
            ]}
          >
            {confirmedStorage && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            I confirm our organization has suitable {listing.storageRequirement}{' '}
            storage and facilities to handle this food safely.
          </Text>
        </Pressable>
      </View>

      {/* Departure point note */}
      <View style={styles.locationNoteBox}>
        <Text style={styles.locationNote}>
          {departureLocation
            ? `Departure coordinates for distance matching: ${departureLocation.latitude.toFixed(4)}, ${departureLocation.longitude.toFixed(4)}`
            : 'No departure GPS coordinates supplied (optional).'}
        </Text>
      </View>

      {/* Error state */}
      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Success banner */}
      {submitted ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            Request submitted! Awaiting donor approval.
          </Text>
        </View>
      ) : null}

      {/* Submit Action */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting || submitted }}
        disabled={submitting || submitted}
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.submitButton,
          (submitting || submitted) && styles.disabledButton,
          pressed && styles.pressedButton,
        ]}
      >
        {submitting ? (
          <View style={styles.buttonLoading}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.submitButtonText}>Submitting request…</Text>
          </View>
        ) : (
          <Text style={styles.submitButtonText}>
            {submitted ? 'Request Submitted' : 'Submit Whole-Listing Request'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginTop: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
  },
  fieldSection: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 12,
    color: colors.secondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surfaceSubtle,
  },
  quickButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  quickButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.greenText,
  },
  storageBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  storageHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  storageInstructions: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: colors.green,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.green,
  },
  checkmark: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    fontWeight: '500',
  },
  locationNoteBox: {
    paddingHorizontal: 4,
  },
  locationNote: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  errorBox: {
    backgroundColor: colors.red,
    borderColor: colors.redBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: colors.redText,
    fontSize: 13,
    lineHeight: 18,
  },
  successBox: {
    backgroundColor: colors.greenSurface,
    borderColor: colors.green,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  successText: {
    color: colors.greenText,
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  pressedButton: {
    opacity: 0.8,
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

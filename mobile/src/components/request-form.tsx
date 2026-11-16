import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DepartureLocationCard } from './departure-location-card';
import { DateTimePickerField } from './date-time-picker-field';
import type { Coordinates, FoodListing } from '../lib/listings';
import { submitDonationRequest } from '../lib/requests';
import { localDateText, parseLocalDate } from '../lib/listing-form-validation';
import { getQuickPickupTime } from '../lib/donation-ui';
import {
  getSavedRecipientLocation,
  saveRecipientLocation,
} from '../lib/location-service';
import {
  validateDepartureLocation,
  validatePickupProposal,
  validateStorageConfirmation,
} from '../lib/request-validation';

interface RequestFormProps {
  listing: FoodListing;
  departureLocation: Coordinates | null;
  onSuccess?: () => void;
  disabled?: boolean;
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
  disabled = false,
}: RequestFormProps) {
  const [selectedDeparture, setSelectedDeparture] = useState(departureLocation);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (departureLocation) {
        if (active) setSelectedDeparture(departureLocation);
        return;
      }
      return getSavedRecipientLocation().then((saved) => {
        if (active && saved) {
          setSelectedDeparture(saved.coordinates);
        }
      });
    });
    return () => {
      active = false;
    };
  }, [departureLocation]);
  // Compute initial proposed pickup time
  const [proposedText, setProposedText] = useState(() => {
    return localDateText(
      getQuickPickupTime(
        'start',
        listing.pickupStartsAt,
        listing.pickupDeadline,
      ),
    );
  });

  const [confirmedStorage, setConfirmedStorage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (lock.current || submitting || submitted || disabled) return;
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
    const locationCheck = validateDepartureLocation(selectedDeparture);
    if (!locationCheck.valid) {
      setErrorMessage(locationCheck.error ?? 'Invalid departure location.');
      return;
    }

    lock.current = true;
    setSubmitting(true);
    try {
      await submitDonationRequest({
        listingId: listing.id,
        plannedPickupAt: proposedDate,
        canMeetStorageRequirement: true,
        departureLocation: selectedDeparture ?? undefined,
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
      lock.current = false;
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

      {/* Pickup proposal section with Date & Time Picker */}
      <View style={styles.fieldSection}>
        <DateTimePickerField
          label="Proposed Pickup Date & Time *"
          value={proposedText}
          onChangeText={(val) => {
            setProposedText(val);
            if (errorMessage) setErrorMessage('');
          }}
          editable={!submitting && !submitted && !disabled}
          minDate={listing.pickupStartsAt ?? new Date()}
          maxDate={listing.pickupDeadline ?? undefined}
        />
        <View style={styles.quickButtonsRow}>
          {(['start', 'mid', 'beforeDeadline'] as const).map(
            (shortcut, index) => (
              <Pressable
                key={shortcut}
                accessibilityRole="button"
                disabled={submitting || submitted || disabled}
                style={styles.quickButton}
                onPress={() => {
                  const chosen = getQuickPickupTime(
                    shortcut,
                    listing.pickupStartsAt,
                    listing.pickupDeadline,
                  );
                  if (!chosen) {
                    setErrorMessage(
                      'No future minute is available in this pickup window.',
                    );
                    return;
                  }
                  setProposedText(localDateText(chosen));
                  setErrorMessage('');
                }}
              >
                <Text style={styles.quickButtonText}>
                  {['At Window Start', 'Mid Window', '30m Before End'][index]}
                </Text>
              </Pressable>
            ),
          )}
        </View>
        <Text style={styles.hint}>
          Allowed window: {localDateText(listing.pickupStartsAt)} to{' '}
          {localDateText(listing.pickupDeadline)} (local time)
        </Text>
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
            if (!submitting && !submitted && !disabled) {
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

      <DepartureLocationCard
        departureLocation={selectedDeparture}
        pickupLocation={listing.pickupLocation}
        disabled={submitting || submitted || disabled}
        onLocationChange={(location, addr) => {
          setSelectedDeparture(location);
          if (location) {
            void saveRecipientLocation(location, addr || '');
          }
        }}
      />
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
        accessibilityState={{ disabled: submitting || submitted || disabled }}
        disabled={submitting || submitted || disabled}
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.submitButton,
          (submitting || submitted || disabled) && styles.disabledButton,
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
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  quickButton: {
    maxWidth: '100%',
    flexShrink: 1,
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
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: '#115533',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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

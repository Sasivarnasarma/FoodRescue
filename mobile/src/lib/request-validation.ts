import type { Coordinates, FoodListing } from './listings';
import type { DonationRequest } from './requests';

export function formatDateText(date?: Date | null): string {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a proposed pickup time against listing window and deadlines.
 * Requests must be at or after current time, inside pickup window,
 * and submitted at least 15 minutes before the deadline.
 */
export function validatePickupProposal(
  proposedTime: Date,
  pickupStartsAt?: Date | null,
  pickupDeadline?: Date | null,
  now: Date = new Date(),
): ValidationResult {
  if (!proposedTime || !Number.isFinite(proposedTime.getTime())) {
    return {
      valid: false,
      error: 'Enter a valid proposed pickup date and time.',
    };
  }

  if (
    !pickupStartsAt ||
    !pickupDeadline ||
    !Number.isFinite(pickupStartsAt.getTime()) ||
    !Number.isFinite(pickupDeadline.getTime()) ||
    !Number.isFinite(now.getTime()) ||
    pickupStartsAt.getTime() >= pickupDeadline.getTime()
  ) {
    return {
      valid: false,
      error: 'This donation does not have a valid pickup window.',
    };
  }
  const nowMillis = now.getTime();
  const proposedMillis = proposedTime.getTime();

  if (proposedMillis < nowMillis) {
    return {
      valid: false,
      error: 'Proposed pickup time must be in the future.',
    };
  }

  if (pickupStartsAt && Number.isFinite(pickupStartsAt.getTime())) {
    if (proposedMillis < pickupStartsAt.getTime()) {
      return {
        valid: false,
        error: `Proposed pickup time cannot be before the pickup start time (${formatDateText(pickupStartsAt)}).`,
      };
    }
  }

  if (pickupDeadline && Number.isFinite(pickupDeadline.getTime())) {
    const deadlineMillis = pickupDeadline.getTime();
    if (nowMillis + 15 * 60 * 1000 > deadlineMillis) {
      return {
        valid: false,
        error:
          'Requests must be submitted at least 15 minutes before the pickup deadline.',
      };
    }
    if (proposedMillis > deadlineMillis) {
      return {
        valid: false,
        error: `Proposed pickup time cannot be after the pickup deadline (${formatDateText(pickupDeadline)}).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates the recipient's affirmative declaration of meeting storage requirements.
 */
export function validateStorageConfirmation(
  canMeet: boolean,
): ValidationResult {
  if (!canMeet) {
    return {
      valid: false,
      error:
        'You must confirm that your organization can meet the storage requirements.',
    };
  }
  return { valid: true };
}

/**
 * Validates recipient departure coordinates when provided.
 * Coordinates are optional for matching and must be valid lat/long.
 */
export function validateDepartureLocation(
  coords?: Coordinates | null,
): ValidationResult {
  if (!coords) return { valid: true };
  if (
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude) ||
    Math.abs(coords.latitude) > 90 ||
    Math.abs(coords.longitude) > 180
  ) {
    return {
      valid: false,
      error:
        'Departure coordinates must have valid latitude (-90 to 90) and longitude (-180 to 180).',
    };
  }
  return { valid: true };
}

export type EffectiveRequestStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'withdrawn'
  | 'assigned_to_other'
  | 'cancelled'
  | 'expired'
  | 'collected';

export interface DerivedRequestState {
  status: EffectiveRequestStatus;
  label: string;
  tone: 'neutral' | 'warning' | 'error' | 'success' | 'info';
  description: string;
  canWithdraw: boolean;
  canRequest: boolean;
}

/**
 * Derives the effective recipient request state based on the organization's request
 * and the parent listing after-states.
 *
 * As specified in docs/05_DATABASE_SCHEMA.md:
 * "Once another request is approved, the UI derives 'assigned to another recipient'
 * from the parent instead of writing to every request."
 */
export function deriveRequestState(
  request: DonationRequest | null,
  listing: FoodListing | null,
  currentUid: string,
  now: Date = new Date(),
): DerivedRequestState {
  if (!listing) {
    return {
      status: 'none',
      label: 'Unavailable',
      tone: 'neutral',
      description: 'Listing details are unavailable.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  // If user withdrew their own request
  if (request?.status === 'withdrawn') {
    return {
      status: 'withdrawn',
      label: 'Request Withdrawn',
      tone: 'neutral',
      description:
        'You withdrew your request for this listing. Under FoodRescue rules, a withdrawn request cannot be resubmitted.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  // If listing is collected
  if (listing.status === 'collected' || request?.status === 'collected') {
    return {
      status: 'collected',
      label: 'Donation Collected',
      tone: 'info',
      description: 'This donation has already been collected.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  // If listing is cancelled
  if (listing.status === 'cancelled' || request?.status === 'cancelled') {
    return {
      status: 'cancelled',
      label: 'Listing Cancelled',
      tone: 'error',
      description: 'This donation listing was cancelled by the donor.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  // If listing is expired or past deadline
  const isPastDeadline = Boolean(
    listing.pickupDeadline && listing.pickupDeadline.getTime() <= now.getTime(),
  );
  if (
    listing.status === 'expired' ||
    request?.status === 'expired' ||
    isPastDeadline
  ) {
    return {
      status: 'expired',
      label: 'Pickup Window Expired',
      tone: 'neutral',
      description: 'The pickup deadline for this donation has passed.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  // If request is approved or listing is assigned to current user
  if (
    request?.status === 'approved' ||
    (listing.status === 'assigned' &&
      listing.acceptedOrganizationUid === currentUid)
  ) {
    return {
      status: 'approved',
      label: 'Request Approved!',
      tone: 'success',
      description:
        'The donor approved your request and assigned this whole donation to your organization. Pickup handover and QR verification will occur during pickup.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  // If listing is assigned to another organization
  if (
    listing.status === 'assigned' &&
    listing.acceptedOrganizationUid &&
    listing.acceptedOrganizationUid !== currentUid
  ) {
    return {
      status: 'assigned_to_other',
      label: 'Assigned to Another Recipient',
      tone: 'neutral',
      description:
        'The donor has selected another organization for this donation listing.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  // If user has a pending request
  if (request?.status === 'requested') {
    return {
      status: 'pending',
      label: 'Pending Donor Review',
      tone: 'warning',
      description:
        'Your request has been submitted. The donor will review eligible requests and approve one organization.',
      canWithdraw: true,
      canRequest: false,
    };
  }

  // No request yet. Check eligibility to request.
  const isTooCloseToDeadline = Boolean(
    listing.pickupDeadline &&
    now.getTime() + 15 * 60 * 1000 > listing.pickupDeadline.getTime(),
  );

  if (listing.status !== 'open') {
    return {
      status: 'none',
      label: 'Not Open',
      tone: 'neutral',
      description: 'This listing is not currently accepting requests.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  if (isTooCloseToDeadline) {
    return {
      status: 'none',
      label: 'Requests Closed',
      tone: 'warning',
      description:
        'Requests must be submitted at least 15 minutes before the pickup deadline. This listing is closing soon.',
      canWithdraw: false,
      canRequest: false,
    };
  }

  return {
    status: 'none',
    label: 'Open for Requests',
    tone: 'info',
    description: 'You can request this whole listing.',
    canWithdraw: false,
    canRequest: true,
  };
}

export type PickupWindowStatus = 'before_start' | 'active' | 'elapsed';
export type RecipientConfirmationStatus =
  'not_confirmed' | 'confirmed_valid' | 'confirmed_stale';

export interface RecipientPickupTiming {
  windowStatus: PickupWindowStatus;
  canConfirmHandover: boolean;
  confirmationStatus: RecipientConfirmationStatus;
  remainingConfirmationSeconds: number;
  remainingWindowSeconds: number;
  secondsUntilStart: number;
  canReconcileExpiry: boolean;
  cancellationEffect: 'open' | 'cancelled';
}

/**
 * Computes live pickup timing and state for an assigned recipient.
 */
export function getRecipientPickupTiming(
  listing: FoodListing,
  request: DonationRequest | null,
  now = new Date(),
): RecipientPickupTiming {
  const nowMs = now.getTime();
  const startMs = listing.pickupStartsAt?.getTime() ?? nowMs;
  const deadlineMs = listing.pickupDeadline?.getTime() ?? nowMs;

  let windowStatus: PickupWindowStatus = 'active';
  if (nowMs < startMs) {
    windowStatus = 'before_start';
  } else if (nowMs >= deadlineMs) {
    windowStatus = 'elapsed';
  }

  const canConfirmHandover =
    windowStatus === 'active' &&
    listing.status === 'assigned' &&
    request?.status === 'approved';

  let confirmationStatus: RecipientConfirmationStatus = 'not_confirmed';
  let remainingConfirmationSeconds = 0;

  if (request?.recipientConfirmedAt) {
    const confirmedMs = request.recipientConfirmedAt.getTime();
    const expiryMs = confirmedMs + 5 * 60 * 1000;
    if (nowMs <= expiryMs && confirmedMs <= nowMs) {
      confirmationStatus = 'confirmed_valid';
      remainingConfirmationSeconds = Math.max(
        0,
        Math.ceil((expiryMs - nowMs) / 1000),
      );
    } else {
      confirmationStatus = 'confirmed_stale';
      remainingConfirmationSeconds = 0;
    }
  }

  const remainingWindowSeconds = Math.max(
    0,
    Math.ceil((deadlineMs - nowMs) / 1000),
  );
  const secondsUntilStart = Math.max(0, Math.ceil((startMs - nowMs) / 1000));

  const canReconcileExpiry =
    windowStatus === 'elapsed' &&
    (listing.status === 'assigned' || listing.status === 'open');

  const cancellationEffect =
    nowMs + 15 * 60 * 1000 <= deadlineMs ? 'open' : 'cancelled';

  return {
    windowStatus,
    canConfirmHandover,
    confirmationStatus,
    remainingConfirmationSeconds,
    remainingWindowSeconds,
    secondsUntilStart,
    canReconcileExpiry,
    cancellationEffect,
  };
}

export function formatSecondsCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export function formatTimeSpan(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  if (clamped < 60) return `${clamped}s`;
  const minutes = Math.floor(clamped / 60);
  if (minutes < 60) {
    const sec = clamped % 60;
    return sec > 0 ? `${minutes}m ${sec}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

export function getPickupQrPayload(listingId: string): {
  reference: string;
  raw: string;
  version: number;
} {
  return {
    reference: `FR-${listingId.toUpperCase()}`,
    raw: `foodrescue:pickup:v1:${listingId}`,
    version: 1,
  };
}

export type AssignmentCancellationMode = 'release' | 'close';

export function assertCollectionTiming(
  startsAt: number,
  deadline: number,
  confirmedAt: number,
  now = Date.now(),
): void {
  if (
    ![startsAt, deadline, confirmedAt, now].every(Number.isFinite) ||
    startsAt >= deadline
  ) {
    throw new Error('Pickup timing is invalid. Reload the donation.');
  }
  if (now < startsAt || now >= deadline) {
    throw new Error(
      'Collection must be inside the pickup window and before its deadline.',
    );
  }
  if (
    confirmedAt < startsAt ||
    confirmedAt > now ||
    now > confirmedAt + 5 * 60_000
  ) {
    throw new Error(
      'Recipient confirmation must be within the pickup window and no more than five minutes old. Ask the recipient to confirm again.',
    );
  }
}

export function assignmentCancellationStatus(
  deadline: number,
  isDonor: boolean,
  mode: AssignmentCancellationMode = 'release',
  now = Date.now(),
): 'open' | 'cancelled' {
  if (![deadline, now].every(Number.isFinite))
    throw new Error('Pickup deadline is invalid. Reload the donation.');
  if (now >= deadline)
    throw new Error('Pickup deadline has elapsed. Reconcile expiry instead.');
  if (mode !== 'release' && mode !== 'close')
    throw new Error('Choose a valid cancellation action.');
  const canReopen = now + 15 * 60_000 <= deadline;
  if (mode === 'close' && !isDonor && canReopen) {
    throw new Error(
      'Only the donor can close this donation while at least 15 minutes remain.',
    );
  }
  return mode === 'close' || !canReopen ? 'cancelled' : 'open';
}

export interface CollectionEligibility {
  canCollect: boolean;
  status:
    | 'ready'
    | 'awaiting_confirmation'
    | 'expired_confirmation'
    | 'outside_window'
    | 'deadline_expired';
  message: string;
  remainingConfirmationMs: number;
}

export function checkDonorCollectionEligibility(
  startsAt: number | Date | null | undefined,
  deadline: number | Date | null | undefined,
  confirmedAt: number | Date | null | undefined,
  now = Date.now(),
): CollectionEligibility {
  const startsMs =
    startsAt instanceof Date ? startsAt.getTime() : (startsAt ?? NaN);
  const deadlineMs =
    deadline instanceof Date ? deadline.getTime() : (deadline ?? NaN);
  const confirmedMs =
    confirmedAt instanceof Date ? confirmedAt.getTime() : (confirmedAt ?? NaN);

  if (
    !Number.isFinite(startsMs) ||
    !Number.isFinite(deadlineMs) ||
    !Number.isFinite(now) ||
    startsMs >= deadlineMs
  ) {
    return {
      canCollect: false,
      status: 'outside_window',
      message: 'Pickup window timing is not configured.',
      remainingConfirmationMs: 0,
    };
  }

  if (now >= deadlineMs) {
    return {
      canCollect: false,
      status: 'deadline_expired',
      message: 'Pickup deadline has elapsed.',
      remainingConfirmationMs: 0,
    };
  }

  if (now < startsMs) {
    return {
      canCollect: false,
      status: 'outside_window',
      message: 'Pickup window has not opened yet.',
      remainingConfirmationMs: 0,
    };
  }

  if (!Number.isFinite(confirmedMs)) {
    return {
      canCollect: false,
      status: 'awaiting_confirmation',
      message:
        'Awaiting recipient confirmation. Ask the recipient to tap "Confirm Handover" on their device.',
      remainingConfirmationMs: 0,
    };
  }

  if (confirmedMs < startsMs) {
    return {
      canCollect: false,
      status: 'outside_window',
      message: 'Confirmation occurred before pickup window opened.',
      remainingConfirmationMs: 0,
    };
  }

  if (confirmedMs > now) {
    return {
      canCollect: false,
      status: 'awaiting_confirmation',
      message: 'Confirmation timestamp is in the future. Reload the donation.',
      remainingConfirmationMs: 0,
    };
  }

  const elapsedMs = now - confirmedMs;
  const fiveMinutesMs = 5 * 60_000;
  if (elapsedMs > fiveMinutesMs) {
    return {
      canCollect: false,
      status: 'expired_confirmation',
      message:
        'Recipient confirmation expired (> 5 minutes ago). Ask the recipient to confirm handover again.',
      remainingConfirmationMs: 0,
    };
  }

  const remainingConfirmationMs = Math.max(0, fiveMinutesMs - elapsedMs);
  return {
    canCollect: true,
    status: 'ready',
    message: 'Recipient has confirmed handover. Ready to complete collection.',
    remainingConfirmationMs,
  };
}

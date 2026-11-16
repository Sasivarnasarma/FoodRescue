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

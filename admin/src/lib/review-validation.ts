export function validateReviewReason(
  decision: 'approved' | 'rejected',
  reason: unknown,
): { valid: boolean; error?: string } {
  if (decision === 'approved') return { valid: true };
  if (
    decision !== 'rejected' ||
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.trim().length > 500
  ) {
    return {
      valid: false,
      error: 'Enter a rejection reason from 1 to 500 characters.',
    };
  }
  return { valid: true };
}

export function isReviewableSnapshot(
  data: Record<string, unknown> | null | undefined,
  metadata: { fromCache: boolean; hasPendingWrites: boolean },
): boolean {
  return (
    !!data &&
    !metadata.fromCache &&
    !metadata.hasPendingWrites &&
    (data.type === 'provider' || data.type === 'organization') &&
    ['pending', 'approved', 'rejected'].includes(
      String(data.verificationStatus),
    )
  );
}

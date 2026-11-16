export function matchesDonationSearch(
  listing: {
    title: string;
    description: string;
    providerName: string;
    category: string;
  },
  query: string,
): boolean {
  const term = query.trim().toLowerCase();
  return [
    listing.title,
    listing.description,
    listing.providerName,
    listing.category,
  ].some((value) => value.toLowerCase().includes(term));
}

export type PickupTimeShortcut = 'start' | 'mid' | 'beforeDeadline';

/** Suggest a future whole minute within the window used by the pickup form. */
export function getQuickPickupTime(
  shortcut: PickupTimeShortcut,
  startsAt: Date | undefined,
  deadline: Date | undefined,
  now = new Date(),
): Date | null {
  const startMs = startsAt?.getTime() ?? NaN;
  const endMs = deadline?.getTime() ?? NaN;
  const nowMs = now.getTime();
  if (![startMs, endMs, nowMs].every(Number.isFinite) || startMs >= endMs)
    return null;

  const minute = 60_000;
  const earliest = Math.ceil(Math.max(startMs, nowMs + 1) / minute) * minute;
  const latest = Math.floor((endMs - 1) / minute) * minute;
  if (earliest > latest) return null;

  const preferred =
    shortcut === 'start'
      ? Math.max(startMs, nowMs + 5 * minute)
      : shortcut === 'mid'
        ? (Math.max(startMs, nowMs) + endMs) / 2
        : endMs - 30 * minute;
  return new Date(
    Math.min(
      latest,
      Math.max(earliest, Math.ceil(preferred / minute) * minute),
    ),
  );
}

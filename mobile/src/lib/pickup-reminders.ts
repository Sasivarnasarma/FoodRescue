import AsyncStorage from '@react-native-async-storage/async-storage';

export type PickupWindowPhase =
  'upcoming' | 'active' | 'expiring_soon' | 'expired';

export interface PickupCountdownInfo {
  phase: PickupWindowPhase;
  millisLeft: number;
  minutesLeft: number;
  formatted: string;
  isInsideWindow: boolean;
  canConfirmHandover: boolean;
  canReopenOnCancel: boolean;
}

export interface ReminderSchedule {
  listingId: string;
  windowOpenAt: Date;
  expiringSoonAt: Date;
  deadlineAt: Date;
}

const STORAGE_KEY_PREFIX = 'foodrescue:reminder:';

/**
 * Formats a millisecond duration into human-readable hours/minutes.
 */
export function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return '0m';
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)}m`;
}

/**
 * Evaluates the current pickup window phase, remaining time, and feasibility rules.
 */
export function getPickupCountdown(
  startsAt: number,
  deadline: number,
  now = Date.now(),
): PickupCountdownInfo {
  if (
    ![startsAt, deadline, now].every(Number.isFinite) ||
    startsAt >= deadline
  ) {
    return {
      phase: 'expired',
      millisLeft: 0,
      minutesLeft: 0,
      formatted: 'Invalid window',
      isInsideWindow: false,
      canConfirmHandover: false,
      canReopenOnCancel: false,
    };
  }

  // Before window starts
  if (now < startsAt) {
    const millisUntilStart = startsAt - now;
    return {
      phase: 'upcoming',
      millisLeft: millisUntilStart,
      minutesLeft: Math.ceil(millisUntilStart / 60_000),
      formatted: `Opens in ${formatDuration(millisUntilStart)}`,
      isInsideWindow: false,
      canConfirmHandover: false,
      canReopenOnCancel: deadline - now >= 15 * 60_000,
    };
  }

  // After deadline
  if (now >= deadline) {
    return {
      phase: 'expired',
      millisLeft: 0,
      minutesLeft: 0,
      formatted: 'Window closed',
      isInsideWindow: false,
      canConfirmHandover: false,
      canReopenOnCancel: false,
    };
  }

  // Inside window
  const millisUntilDeadline = deadline - now;
  const minutesUntilDeadline = Math.floor(millisUntilDeadline / 60_000);
  const isExpiringSoon = millisUntilDeadline <= 15 * 60_000;

  return {
    phase: isExpiringSoon ? 'expiring_soon' : 'active',
    millisLeft: millisUntilDeadline,
    minutesLeft: minutesUntilDeadline,
    formatted: isExpiringSoon
      ? `Urgent: ${formatDuration(millisUntilDeadline)} remaining`
      : `${formatDuration(millisUntilDeadline)} left for pickup`,
    isInsideWindow: true,
    canConfirmHandover: true,
    canReopenOnCancel: !isExpiringSoon,
  };
}

/**
 * Computes scheduled reminder checkpoints for a given pickup window.
 */
export function computeReminderSchedule(
  listingId: string,
  startsAt: number,
  deadline: number,
): ReminderSchedule {
  return {
    listingId,
    windowOpenAt: new Date(startsAt),
    expiringSoonAt: new Date(deadline - 15 * 60_000),
    deadlineAt: new Date(deadline),
  };
}

/**
 * Checks whether an in-app local pickup reminder is enabled for this listing.
 */
export async function isPickupReminderSet(listingId: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${listingId}`);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Toggles an in-app local pickup reminder for this listing.
 */
export async function setPickupReminder(
  listingId: string,
  enabled: boolean,
): Promise<boolean> {
  try {
    if (enabled) {
      await AsyncStorage.setItem(`${STORAGE_KEY_PREFIX}${listingId}`, 'true');
    } else {
      await AsyncStorage.removeItem(`${STORAGE_KEY_PREFIX}${listingId}`);
    }
    return true;
  } catch {
    return false;
  }
}

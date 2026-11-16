import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeReminderSchedule,
  formatDuration,
  getPickupCountdown,
} from '../src/lib/pickup-reminders.ts';

test('formatDuration formats milliseconds into compact hours and minutes', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(-1000), '0m');
  assert.equal(formatDuration(45 * 1000), '1m'); // Less than a minute rounds up to 1m
  assert.equal(formatDuration(5 * 60 * 1000), '5m');
  assert.equal(formatDuration(60 * 60 * 1000), '1h');
  assert.equal(formatDuration((2 * 60 + 15) * 60 * 1000), '2h 15m');
});

test('getPickupCountdown correctly categorizes upcoming, active, expiring_soon, and expired phases', () => {
  const startsAt = 1_000_000;
  const deadline = 2_000_000;

  // Upcoming: before start
  const upcoming = getPickupCountdown(startsAt, deadline, 500_000);
  assert.equal(upcoming.phase, 'upcoming');
  assert.equal(upcoming.isInsideWindow, false);
  assert.equal(upcoming.canConfirmHandover, false);
  assert.ok(upcoming.formatted.includes('Opens in'));

  // Active: inside window with >15 minutes left
  // deadline - 15 min = 2_000_000 - 900_000 = 1_100_000
  const active = getPickupCountdown(startsAt, deadline, 1_050_000);
  assert.equal(active.phase, 'active');
  assert.equal(active.isInsideWindow, true);
  assert.equal(active.canConfirmHandover, true);
  assert.equal(active.canReopenOnCancel, true);
  assert.ok(active.formatted.includes('left for pickup'));

  // Expiring soon: <= 15 minutes left
  const expiringSoon = getPickupCountdown(startsAt, deadline, 1_500_000);
  assert.equal(expiringSoon.phase, 'expiring_soon');
  assert.equal(expiringSoon.isInsideWindow, true);
  assert.equal(expiringSoon.canConfirmHandover, true);
  assert.equal(expiringSoon.canReopenOnCancel, false);
  assert.ok(upcoming.formatted.includes('Opens in'));

  // Expired: at or after deadline
  const expired = getPickupCountdown(startsAt, deadline, 2_000_000);
  assert.equal(expired.phase, 'expired');
  assert.equal(expired.isInsideWindow, false);
  assert.equal(expired.canConfirmHandover, false);
  assert.equal(expired.canReopenOnCancel, false);

  const pastExpired = getPickupCountdown(startsAt, deadline, 2_500_000);
  assert.equal(pastExpired.phase, 'expired');
});

test('getPickupCountdown rejects invalid numbers and backwards windows', () => {
  assert.equal(getPickupCountdown(2000, 1000, 1500).phase, 'expired');
  assert.equal(getPickupCountdown(NaN, 1000, 1500).phase, 'expired');
  assert.equal(getPickupCountdown(1000, NaN, 1500).phase, 'expired');
});

test('computeReminderSchedule calculates checkpoints correctly', () => {
  const startsAt = 10_000_000;
  const deadline = 20_000_000;
  const schedule = computeReminderSchedule('listing_1', startsAt, deadline);

  assert.equal(schedule.listingId, 'listing_1');
  assert.equal(schedule.windowOpenAt.getTime(), startsAt);
  assert.equal(schedule.expiringSoonAt.getTime(), deadline - 15 * 60_000);
  assert.equal(schedule.deadlineAt.getTime(), deadline);
});

test('countdown permits reopening at the exact 15-minute boundary', () => {
  const deadline = 2_000_000;
  assert.equal(
    getPickupCountdown(0, deadline, deadline - 900_000).canReopenOnCancel,
    true,
  );
  assert.equal(
    getPickupCountdown(0, deadline, deadline - 899_999).canReopenOnCancel,
    false,
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getQuickPickupTime,
  matchesDonationSearch,
} from '../src/lib/donation-ui.ts';
import { validatePickupProposal } from '../src/lib/request-validation.ts';

const time = (hour, minute, second = 0) =>
  new Date(2026, 10, 16, hour, minute, second);
const shortcuts = ['start', 'mid', 'beforeDeadline'];

test('donation search includes category, ignores case and trims whitespace', () => {
  const listing = {
    title: 'Fresh carrots',
    description: 'Whole bags',
    providerName: 'Test shop',
    category: 'Produce',
  };
  for (const query of [' PRODUCE ', 'carrots', 'bags', 'SHOP', '', '   '])
    assert.equal(matchesDonationSearch(listing, query), true);
  assert.equal(matchesDonationSearch(listing, 'Bakery'), false);
});

test('quick times remain inside a future window shorter than thirty minutes', () => {
  const start = time(14, 0);
  const deadline = time(14, 20);
  const now = time(12, 0);
  for (const shortcut of shortcuts) {
    const proposal = getQuickPickupTime(shortcut, start, deadline, now);
    assert.equal(
      validatePickupProposal(proposal, start, deadline, now).valid,
      true,
    );
    assert.ok(proposal < deadline);
  }
  assert.equal(
    getQuickPickupTime('beforeDeadline', start, deadline, now).getTime(),
    start.getTime(),
  );
});

test('an active window never suggests a past time', () => {
  const start = time(12, 0);
  const deadline = time(14, 0);
  const now = time(13, 40, 35);
  for (const shortcut of shortcuts) {
    const proposal = getQuickPickupTime(shortcut, start, deadline, now);
    assert.ok(proposal > now);
    assert.equal(
      validatePickupProposal(proposal, start, deadline, now).valid,
      true,
    );
  }
});

test('rounding never moves a shortcut before a start with seconds', () => {
  const start = time(14, 0, 35);
  const deadline = time(14, 20);
  const now = time(12, 0);
  for (const shortcut of shortcuts) {
    const proposal = getQuickPickupTime(shortcut, start, deadline, now);
    assert.ok(proposal >= start);
    assert.equal(proposal.getSeconds(), 0);
    assert.equal(proposal.getMilliseconds(), 0);
  }
});

test('shortcuts preserve the normal start, midpoint and before-end choices', () => {
  const start = time(14, 0);
  const deadline = time(16, 0);
  const now = time(12, 0);
  for (const [shortcut, expected] of [
    ['start', time(14, 0)],
    ['mid', time(15, 0)],
    ['beforeDeadline', time(15, 30)],
  ])
    assert.equal(
      getQuickPickupTime(shortcut, start, deadline, now).getTime(),
      expected.getTime(),
    );
});

test('no whole-minute choice is offered after expiry or in a sub-minute window', () => {
  assert.equal(
    getQuickPickupTime('start', time(12, 0), time(14, 0), time(14, 0)),
    null,
  );
  assert.equal(
    getQuickPickupTime('start', time(14, 0, 10), time(14, 0, 50), time(12, 0)),
    null,
  );
});

test('missing, reversed or invalid windows produce no quick selection', () => {
  for (const [start, deadline] of [
    [undefined, time(14, 0)],
    [time(12, 0), undefined],
    [time(14, 0), time(12, 0)],
    [new Date(NaN), time(14, 0)],
  ])
    assert.equal(
      getQuickPickupTime('start', start, deadline, time(11, 0)),
      null,
    );
});

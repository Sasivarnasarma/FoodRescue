import {
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseClients } from './firebase';
import {
  assertCollectionTiming,
  assignmentCancellationStatus,
  type AssignmentCancellationMode,
} from './pickup-validation';

function timestampMillis(value: unknown, label: string): number {
  if (!(value instanceof Timestamp))
    throw new Error(`${label} is missing or invalid. Reload the donation.`);
  return value.toMillis();
}

async function signedInClients() {
  const clients = getFirebaseClients();
  await clients.auth.authStateReady();
  const user = clients.auth.currentUser;
  if (!user) throw new Error('Sign in before managing pickup.');
  return { ...clients, user };
}

/** The assigned recipient sets a server-timestamped acknowledgement; no offline queue. */
export async function confirmPickupHandover(
  listingId: string,
  organizationUid: string,
): Promise<void> {
  return changeHandoverConfirmation(listingId, organizationUid, false);
}

/** Retraction is allowed while the request is still approved and assigned. */
export async function clearPickupHandover(
  listingId: string,
  organizationUid: string,
): Promise<void> {
  return changeHandoverConfirmation(listingId, organizationUid, true);
}

async function changeHandoverConfirmation(
  listingId: string,
  organizationUid: string,
  clear: boolean,
): Promise<void> {
  const { db, user } = await signedInClients();
  if (user.uid !== organizationUid)
    throw new Error(
      'Only the assigned recipient can manage handover confirmation.',
    );
  const parent = doc(db, 'foodListings', listingId);
  const requestRef = doc(
    db,
    'foodListings',
    listingId,
    'requests',
    organizationUid,
  );
  await runTransaction(db, async (tx) => {
    const [parentSnap, requestSnap] = await Promise.all([
      tx.get(parent),
      tx.get(requestRef),
    ]);
    if (!parentSnap.exists() || !requestSnap.exists())
      throw new Error('Assigned donation or request not found.');
    const listing = parentSnap.data();
    const request = requestSnap.data();
    if (
      listing.status !== 'assigned' ||
      listing.acceptedOrganizationUid !== user.uid ||
      request.status !== 'approved'
    ) {
      throw new Error(
        'This donation is no longer assigned to your organization.',
      );
    }
    if (!clear) {
      const now = Date.now();
      if (
        now < timestampMillis(listing.pickupStartsAt, 'Pickup start') ||
        now >= timestampMillis(listing.pickupDeadline, 'Pickup deadline')
      ) {
        throw new Error(
          'Confirm handover inside the pickup window and before its deadline.',
        );
      }
    }
    tx.update(requestRef, {
      recipientConfirmedAt: clear ? deleteField() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Owner completes the whole donation with a fresh, signed-in recipient confirmation. */
export async function completePickupCollection(
  listingId: string,
  organizationUid: string,
): Promise<void> {
  const { db, user } = await signedInClients();
  const parent = doc(db, 'foodListings', listingId);
  const requestRef = doc(
    db,
    'foodListings',
    listingId,
    'requests',
    organizationUid,
  );
  await runTransaction(db, async (tx) => {
    const [parentSnap, requestSnap] = await Promise.all([
      tx.get(parent),
      tx.get(requestRef),
    ]);
    if (!parentSnap.exists() || !requestSnap.exists())
      throw new Error('Assigned donation or request not found.');
    const listing = parentSnap.data();
    const request = requestSnap.data();
    if (listing.providerUid !== user.uid)
      throw new Error('Only the listing owner can complete collection.');
    if (
      listing.status !== 'assigned' ||
      listing.acceptedOrganizationUid !== organizationUid ||
      request.status !== 'approved'
    ) {
      throw new Error('This request is not the current approved assignment.');
    }
    assertCollectionTiming(
      timestampMillis(listing.pickupStartsAt, 'Pickup start'),
      timestampMillis(listing.pickupDeadline, 'Pickup deadline'),
      timestampMillis(request.recipientConfirmedAt, 'Recipient confirmation'),
    );
    tx.update(parent, {
      status: 'collected',
      collectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(requestRef, {
      status: 'collected',
      updatedAt: serverTimestamp(),
    });
  });
}

/** Release reopens with >=15 minutes left; close lets the donor cancel the whole offer. */
export async function cancelApprovedDonation(
  listingId: string,
  organizationUid: string,
  mode: AssignmentCancellationMode = 'release',
): Promise<{ reopened: boolean }> {
  const { db, user } = await signedInClients();
  const parent = doc(db, 'foodListings', listingId);
  const requestRef = doc(
    db,
    'foodListings',
    listingId,
    'requests',
    organizationUid,
  );
  return runTransaction(db, async (tx) => {
    const [parentSnap, requestSnap] = await Promise.all([
      tx.get(parent),
      tx.get(requestRef),
    ]);
    if (!parentSnap.exists() || !requestSnap.exists())
      throw new Error('Assigned donation or request not found.');
    const listing = parentSnap.data();
    const request = requestSnap.data();
    const isDonor = listing.providerUid === user.uid;
    if (!isDonor && listing.acceptedOrganizationUid !== user.uid)
      throw new Error('Only assigned participants can cancel the assignment.');
    if (
      listing.status !== 'assigned' ||
      listing.acceptedOrganizationUid !== organizationUid ||
      request.status !== 'approved'
    ) {
      throw new Error('This request is not the current approved assignment.');
    }
    const status = assignmentCancellationStatus(
      timestampMillis(listing.pickupDeadline, 'Pickup deadline'),
      isDonor,
      mode,
    );
    tx.update(parent, {
      status,
      acceptedOrganizationUid: deleteField(),
      updatedAt: serverTimestamp(),
    });
    tx.update(requestRef, {
      status: 'cancelled',
      recipientConfirmedAt: deleteField(),
      updatedAt: serverTimestamp(),
    });
    return { reopened: status === 'open' };
  });
}

/** Owner, admin or assigned recipient reconciles an overdue listing and its selected request. */
export async function reconcileExpiredListing(
  listingId: string,
): Promise<void> {
  const { db } = await signedInClients();
  const parent = doc(db, 'foodListings', listingId);
  await runTransaction(db, async (tx) => {
    const parentSnap = await tx.get(parent);
    if (!parentSnap.exists()) throw new Error('Listing not found.');
    const listing = parentSnap.data();
    if (Date.now() < timestampMillis(listing.pickupDeadline, 'Pickup deadline'))
      throw new Error('The pickup deadline has not elapsed.');
    if (listing.status === 'open') {
      tx.update(parent, { status: 'expired', updatedAt: serverTimestamp() });
      return;
    }
    if (
      listing.status !== 'assigned' ||
      typeof listing.acceptedOrganizationUid !== 'string'
    ) {
      throw new Error('Only open or assigned donations can be expired.');
    }
    const requestRef = doc(
      db,
      'foodListings',
      listingId,
      'requests',
      listing.acceptedOrganizationUid,
    );
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists() || requestSnap.data().status !== 'approved')
      throw new Error('Current approved request not found.');
    tx.update(parent, {
      status: 'expired',
      acceptedOrganizationUid: deleteField(),
      updatedAt: serverTimestamp(),
    });
    tx.update(requestRef, {
      status: 'expired',
      recipientConfirmedAt: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}

export {
  encodePickupQrPayload,
  parsePickupReference,
  generateQrMatrix,
  isValidListingId,
  CURRENT_QR_VERSION,
  QR_PREFIX,
  type QrParseResult,
  type QrMatrix,
} from './qr-service';

export {
  getPickupCountdown,
  formatDuration,
  computeReminderSchedule,
  isPickupReminderSet,
  setPickupReminder,
  type PickupCountdownInfo,
  type PickupWindowPhase,
  type ReminderSchedule,
} from './pickup-reminders';

import {
  GeoPoint,
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseClients } from './firebase';
import type { Coordinates, ListingPage, ListingPageOptions } from './listings';

export type RequestStatus =
  | 'requested'
  | 'approved'
  | 'withdrawn'
  | 'cancelled'
  | 'collected'
  | 'expired';

export interface DonationRequest {
  id: string; // matches organizationUid
  listingId: string;
  organizationUid: string;
  providerUid: string;
  organizationName: string;
  departureLocation?: Coordinates;
  plannedPickupAt: Date;
  canMeetStorageRequirement: boolean;
  status: RequestStatus;
  recipientConfirmedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SubmitRequestInput {
  listingId: string;
  plannedPickupAt: Date;
  canMeetStorageRequirement: boolean;
  departureLocation?: Coordinates;
}

export function docDataToDonationRequest(
  docId: string,
  listingId: string,
  data: DocumentData,
): DonationRequest {
  return {
    id: docId,
    listingId,
    organizationUid: data.organizationUid,
    providerUid: data.providerUid,
    organizationName: data.organizationName ?? '',
    departureLocation:
      data.departureLocation instanceof GeoPoint
        ? {
            latitude: data.departureLocation.latitude,
            longitude: data.departureLocation.longitude,
          }
        : undefined,
    plannedPickupAt:
      data.plannedPickupAt instanceof Timestamp
        ? data.plannedPickupAt.toDate()
        : new Date(data.plannedPickupAt),
    canMeetStorageRequirement: Boolean(data.canMeetStorageRequirement),
    status: data.status,
    recipientConfirmedAt:
      data.recipientConfirmedAt instanceof Timestamp
        ? data.recipientConfirmedAt.toDate()
        : undefined,
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    updatedAt:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
  };
}

async function getVerifiedOrganizationInfo(uid: string) {
  const { db } = getFirebaseClients();
  const userRef = doc(db, 'users', uid);
  const profileRef = doc(db, 'profiles', uid);

  const [userSnap, profileSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(profileRef),
  ]);

  if (!userSnap.exists()) {
    throw new Error('Account record not found.');
  }
  const userData = userSnap.data();
  if (userData.role !== 'organization' || userData.accountStatus !== 'active') {
    throw new Error(
      'Only active recipient organizations can request food listings.',
    );
  }

  if (!profileSnap.exists()) {
    throw new Error(
      'Organization profile not found. Please submit your profile.',
    );
  }
  const profileData = profileSnap.data();
  if (profileData.verificationStatus !== 'approved') {
    throw new Error(
      'Your organization must be verified and approved before requesting food.',
    );
  }

  return {
    organizationName: profileData.name as string,
  };
}

/**
 * Submits a whole-listing request for an open food donation.
 */
export async function submitDonationRequest(
  input: SubmitRequestInput,
): Promise<DonationRequest> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to submit a request.');
  }

  if (!input.canMeetStorageRequirement) {
    throw new Error(
      'You must confirm your organization can meet the food storage requirements.',
    );
  }

  if (!Number.isFinite(input.plannedPickupAt.getTime())) {
    throw new Error('Enter a valid proposed pickup date and time.');
  }
  if (
    input.departureLocation &&
    (!Number.isFinite(input.departureLocation.latitude) ||
      !Number.isFinite(input.departureLocation.longitude) ||
      Math.abs(input.departureLocation.latitude) > 90 ||
      Math.abs(input.departureLocation.longitude) > 180)
  ) {
    throw new Error('Enter valid departure coordinates.');
  }

  const { organizationName } = await getVerifiedOrganizationInfo(user.uid);

  const listingRef = doc(db, 'foodListings', input.listingId);
  const listingSnap = await getDoc(listingRef);
  if (!listingSnap.exists()) {
    throw new Error('The requested donation listing does not exist.');
  }

  const listingData = listingSnap.data();
  if (listingData.status !== 'open') {
    throw new Error('This listing is no longer open for requests.');
  }

  const now = Date.now();
  const pickupStartsAtMillis =
    listingData.pickupStartsAt instanceof Timestamp
      ? listingData.pickupStartsAt.toMillis()
      : new Date(listingData.pickupStartsAt).getTime();
  const pickupDeadlineMillis =
    listingData.pickupDeadline instanceof Timestamp
      ? listingData.pickupDeadline.toMillis()
      : new Date(listingData.pickupDeadline).getTime();

  // Requests require at least 15 minutes before the pickup deadline
  const fifteenMinutes = 15 * 60 * 1000;
  if (now + fifteenMinutes > pickupDeadlineMillis) {
    throw new Error(
      'Requests must be submitted at least 15 minutes before the pickup deadline.',
    );
  }

  const plannedPickupMillis = input.plannedPickupAt.getTime();
  if (
    plannedPickupMillis < now ||
    plannedPickupMillis < pickupStartsAtMillis ||
    plannedPickupMillis > pickupDeadlineMillis
  ) {
    throw new Error(
      'Proposed pickup time must be in the future and within the pickup window.',
    );
  }

  const requestRef = doc(
    db,
    'foodListings',
    input.listingId,
    'requests',
    user.uid,
  );

  const payload: Record<string, unknown> = {
    organizationUid: user.uid,
    providerUid: listingData.providerUid,
    organizationName,
    plannedPickupAt: Timestamp.fromDate(input.plannedPickupAt),
    canMeetStorageRequirement: true,
    status: 'requested',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.departureLocation) {
    payload.departureLocation = new GeoPoint(
      input.departureLocation.latitude,
      input.departureLocation.longitude,
    );
  }

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(requestRef);
    if (existing.exists()) {
      throw new Error('Your organization has already requested this listing.');
    }
    transaction.set(requestRef, payload);
  });

  return {
    id: user.uid,
    listingId: input.listingId,
    organizationUid: user.uid,
    providerUid: listingData.providerUid,
    organizationName,
    departureLocation: input.departureLocation,
    plannedPickupAt: input.plannedPickupAt,
    canMeetStorageRequirement: true,
    status: 'requested',
  };
}

/**
 * Recipient withdraws their own pending request before donor approval.
 */
export async function withdrawDonationRequest(
  listingId: string,
  organizationUid: string,
): Promise<void> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.uid !== organizationUid) {
    throw new Error('You can only withdraw your own request.');
  }

  const requestRef = doc(
    db,
    'foodListings',
    listingId,
    'requests',
    organizationUid,
  );
  await updateDoc(requestRef, {
    status: 'withdrawn',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Donor approves one eligible request, atomically assigning the listing.
 * Reciprocal rules ensure that exactly one organization is assigned.
 */
export async function approveDonationRequest(
  listingId: string,
  organizationUid: string,
): Promise<void> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to approve a request.');
  }

  const listingRef = doc(db, 'foodListings', listingId);
  const requestRef = doc(
    db,
    'foodListings',
    listingId,
    'requests',
    organizationUid,
  );

  await runTransaction(db, async (transaction) => {
    const [listingSnap, requestSnap] = await Promise.all([
      transaction.get(listingRef),
      transaction.get(requestRef),
    ]);

    if (!listingSnap.exists()) {
      throw new Error('Listing not found.');
    }
    const listing = listingSnap.data();
    if (listing.providerUid !== user.uid) {
      throw new Error('Only the listing owner can approve incoming requests.');
    }
    if (listing.status !== 'open') {
      throw new Error('Only open listings can be assigned to a recipient.');
    }

    const now = Date.now();
    const deadlineMillis =
      listing.pickupDeadline instanceof Timestamp
        ? listing.pickupDeadline.toMillis()
        : new Date(listing.pickupDeadline).getTime();

    if (now + 15 * 60 * 1000 > deadlineMillis) {
      throw new Error(
        'Approvals must be completed at least 15 minutes before the pickup deadline.',
      );
    }

    if (!requestSnap.exists()) {
      throw new Error('Request not found.');
    }
    const request = requestSnap.data();
    if (request.status !== 'requested') {
      throw new Error('Only pending requests can be approved.');
    }
    if (!request.canMeetStorageRequirement) {
      throw new Error('Recipient does not meet storage requirements.');
    }

    const plannedPickupMillis =
      request.plannedPickupAt instanceof Timestamp
        ? request.plannedPickupAt.toMillis()
        : new Date(request.plannedPickupAt).getTime();
    const startsMillis =
      listing.pickupStartsAt instanceof Timestamp
        ? listing.pickupStartsAt.toMillis()
        : NaN;
    if (
      !Number.isFinite(plannedPickupMillis) ||
      plannedPickupMillis < now ||
      plannedPickupMillis < startsMillis ||
      plannedPickupMillis > deadlineMillis
    ) {
      throw new Error(
        'Proposed pickup time must still be within the pickup window and not in the past.',
      );
    }

    // Atomic update of parent listing and approved request
    transaction.update(listingRef, {
      status: 'assigned',
      acceptedOrganizationUid: organizationUid,
      updatedAt: serverTimestamp(),
    });

    transaction.update(requestRef, {
      status: 'approved',
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Fetch a single request document for a listing and organization.
 */
export async function getListingRequest(
  listingId: string,
  organizationUid: string,
): Promise<DonationRequest | null> {
  const { db } = getFirebaseClients();
  const requestRef = doc(
    db,
    'foodListings',
    listingId,
    'requests',
    organizationUid,
  );
  const snap = await getDoc(requestRef);
  if (!snap.exists()) return null;
  return docDataToDonationRequest(snap.id, listingId, snap.data());
}

/**
 * Real-time listener for incoming requests on a listing (for donor use).
 */
export function subscribeToListingRequests(
  listingId: string,
  callback: (requests: DonationRequest[], page: ListingPage) => void,
  onError?: (error: Error) => void,
  options: ListingPageOptions = {},
): Unsubscribe {
  const { db } = getFirebaseClients();
  const requestsCol = collection(db, 'foodListings', listingId, 'requests');
  const requestsQuery = query(
    requestsCol,
    orderBy('createdAt', 'desc'),
    ...(options.after ? [startAfter(options.after)] : []),
    limit(50),
  );

  return onSnapshot(
    requestsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const requests = snapshot.docs.map((d) =>
        docDataToDonationRequest(d.id, listingId, d.data()),
      );
      callback(requests, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        nextCursor: snapshot.docs.length === 50 ? snapshot.docs[49] : null,
      });
    },
    (err) => {
      onError?.(err);
    },
  );
}

/**
 * Real-time listener for all requests made by an organization across listings
 * using the collectionGroup query.
 */
export function subscribeToOrganizationRequests(
  organizationUid: string,
  callback: (requests: DonationRequest[], page: ListingPage) => void,
  onError?: (error: Error) => void,
  options: ListingPageOptions = {},
): Unsubscribe {
  const { db } = getFirebaseClients();
  const requestsGroup = collectionGroup(db, 'requests');
  const pageSize = options.limit ?? 50;
  const groupQuery = query(
    requestsGroup,
    where('organizationUid', '==', organizationUid),
    orderBy('createdAt', 'desc'),
    ...(options.after ? [startAfter(options.after)] : []),
    limit(pageSize),
  );

  return onSnapshot(
    groupQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const requests = snapshot.docs.map((d) => {
        // Parent document is foodListings/{listingId}
        const parentListingId = d.ref.parent.parent?.id ?? '';
        return docDataToDonationRequest(d.id, parentListingId, d.data());
      });
      callback(requests, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        nextCursor:
          snapshot.docs.length >= pageSize
            ? snapshot.docs[snapshot.docs.length - 1]
            : null,
      });
    },
    (err) => {
      onError?.(err);
    },
  );
}

/**
 * Real-time listener for an organization's specific request on a listing.
 */
export function subscribeToMyRequestForListing(
  listingId: string,
  organizationUid: string,
  callback: (
    request: DonationRequest | null,
    metadata: Pick<ListingPage, 'fromCache' | 'hasPendingWrites'>,
  ) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseClients();
  const requestRef = doc(
    db,
    'foodListings',
    listingId,
    'requests',
    organizationUid,
  );

  return onSnapshot(
    requestRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      callback(
        snapshot.exists()
          ? docDataToDonationRequest(snapshot.id, listingId, snapshot.data())
          : null,
        {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        },
      );
    },
    (err) => {
      onError?.(err);
    },
  );
}

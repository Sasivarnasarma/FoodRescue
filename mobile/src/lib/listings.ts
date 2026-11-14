import {
  Bytes,
  GeoPoint,
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseClients } from './firebase';

export type ListingStatus =
  'draft' | 'open' | 'assigned' | 'collected' | 'cancelled' | 'expired';

export type ListingUnit = 'pack' | 'portion' | 'item' | 'g';
export type StorageRequirement = 'ambient' | 'chilled' | 'frozen';
export type AllergenDeclaration = 'provided' | 'unknown';

export const FOOD_CATEGORIES = [
  'Bakery',
  'Produce',
  'Prepared Meals',
  'Dairy & Eggs',
  'Meat & Poultry',
  'Pantry & Dry Goods',
  'Beverages',
  'Other',
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface FoodListing {
  id: string;
  providerUid: string;
  providerName: string;
  title: string;
  description: string;
  category: FoodCategory;
  quantity: number;
  unit: ListingUnit;
  storageRequirement: StorageRequirement;
  storageInstructions: string;
  allergenInfo: string;
  allergenDeclaration: AllergenDeclaration;
  pickupAddress: string;
  pickupLocation?: Coordinates;
  pickupStartsAt?: Date;
  pickupDeadline?: Date;
  bestBeforeAt?: Date | null;
  useByAt?: Date | null;
  status: ListingStatus;
  acceptedOrganizationUid?: string;
  createdAt?: Date;
  updatedAt?: Date;
  collectedAt?: Date;
  demoImageKey?: string;
}

export interface DraftListingInput {
  title: string;
  description?: string;
  category?: FoodCategory;
  quantity?: number;
  unit?: ListingUnit;
  storageRequirement?: StorageRequirement;
  storageInstructions?: string;
  allergenInfo?: string;
  allergenDeclaration?: AllergenDeclaration;
  pickupAddress?: string;
  pickupLocation?: Coordinates | null;
  pickupStartsAt?: Date | null;
  pickupDeadline?: Date | null;
  bestBeforeAt?: Date | null;
  useByAt?: Date | null;
  demoImageKey?: string;
}

export interface PublishListingInput {
  title: string;
  description: string;
  category: FoodCategory;
  quantity: number;
  unit: ListingUnit;
  storageRequirement: StorageRequirement;
  storageInstructions: string;
  allergenInfo: string;
  allergenDeclaration: AllergenDeclaration;
  pickupAddress: string;
  pickupLocation: Coordinates;
  pickupStartsAt: Date;
  pickupDeadline: Date;
  bestBeforeAt?: Date | null;
  useByAt?: Date | null;
  demoImageKey?: string;
}

export const MAX_PHOTO_BYTES = 153600; // 150 KiB

function convertDocToListing(
  docId: string,
  data: Record<string, any>,
): FoodListing {
  return {
    id: docId,
    providerUid: data.providerUid,
    providerName: data.providerName,
    title: data.title,
    description: data.description ?? '',
    category: data.category ?? '',
    quantity: data.quantity ?? 1,
    unit: data.unit ?? 'item',
    storageRequirement: data.storageRequirement ?? 'ambient',
    storageInstructions: data.storageInstructions ?? '',
    allergenInfo: data.allergenInfo ?? '',
    allergenDeclaration: data.allergenDeclaration ?? 'unknown',
    pickupAddress: data.pickupAddress ?? '',
    pickupLocation:
      data.pickupLocation instanceof GeoPoint
        ? {
            latitude: data.pickupLocation.latitude,
            longitude: data.pickupLocation.longitude,
          }
        : undefined,
    pickupStartsAt:
      data.pickupStartsAt instanceof Timestamp
        ? data.pickupStartsAt.toDate()
        : undefined,
    pickupDeadline:
      data.pickupDeadline instanceof Timestamp
        ? data.pickupDeadline.toDate()
        : undefined,
    bestBeforeAt: data.bestBeforeAt
      ? data.bestBeforeAt instanceof Timestamp
        ? data.bestBeforeAt.toDate()
        : undefined
      : undefined,
    useByAt: data.useByAt
      ? data.useByAt instanceof Timestamp
        ? data.useByAt.toDate()
        : undefined
      : undefined,
    status: data.status,
    acceptedOrganizationUid: data.acceptedOrganizationUid,
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    updatedAt:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
    collectedAt: data.collectedAt
      ? data.collectedAt instanceof Timestamp
        ? data.collectedAt.toDate()
        : undefined
      : undefined,
    demoImageKey: data.demoImageKey,
  };
}

async function getVerifiedDonorInfo(uid: string) {
  const { db } = getFirebaseClients();
  const profileRef = doc(db, 'profiles', uid);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    throw new Error('Donor profile not found. Please submit your profile.');
  }
  const data = profileSnap.data();
  if (data.type !== 'provider' || data.verificationStatus !== 'approved') {
    throw new Error(
      'Only verified approved donor businesses can manage listings.',
    );
  }
  return { providerName: data.name };
}

export async function createDraftListing(
  input: DraftListingInput,
): Promise<string> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before creating a listing draft.');

  const { providerName } = await getVerifiedDonorInfo(uid);
  if (
    input.quantity !== undefined &&
    (!Number.isInteger(input.quantity) || input.quantity <= 0)
  ) {
    throw new Error('Quantity must be a positive integer.');
  }
  const cleanTitle = input.title.trim();
  if (!cleanTitle || cleanTitle.length > 120) {
    throw new Error('Listing title must be between 1 and 120 characters.');
  }

  const listingsCol = collection(db, 'foodListings');
  const newListingRef = doc(listingsCol);

  const payload: Record<string, any> = {
    providerUid: uid,
    providerName,
    title: cleanTitle,
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.description)
    payload.description = input.description.trim().slice(0, 1000);
  if (input.category) payload.category = input.category.trim().slice(0, 50);
  if (typeof input.quantity === 'number' && input.quantity > 0)
    payload.quantity = Math.floor(input.quantity);
  if (input.unit) payload.unit = input.unit;
  if (input.storageRequirement)
    payload.storageRequirement = input.storageRequirement;
  if (input.storageInstructions)
    payload.storageInstructions = input.storageInstructions
      .trim()
      .slice(0, 500);
  if (input.allergenInfo)
    payload.allergenInfo = input.allergenInfo.trim().slice(0, 500);
  if (input.allergenDeclaration)
    payload.allergenDeclaration = input.allergenDeclaration;
  if (input.pickupAddress)
    payload.pickupAddress = input.pickupAddress.trim().slice(0, 200);
  if (input.pickupLocation) {
    payload.pickupLocation = new GeoPoint(
      input.pickupLocation.latitude,
      input.pickupLocation.longitude,
    );
  }
  if (input.pickupStartsAt)
    payload.pickupStartsAt = Timestamp.fromDate(input.pickupStartsAt);
  if (input.pickupDeadline)
    payload.pickupDeadline = Timestamp.fromDate(input.pickupDeadline);
  if (input.bestBeforeAt)
    payload.bestBeforeAt = Timestamp.fromDate(input.bestBeforeAt);
  if (input.useByAt) payload.useByAt = Timestamp.fromDate(input.useByAt);
  if (input.demoImageKey)
    payload.demoImageKey = input.demoImageKey.trim().slice(0, 100);

  await setDoc(newListingRef, payload);
  return newListingRef.id;
}

export async function updateDraftListing(
  listingId: string,
  input: DraftListingInput,
): Promise<void> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before updating a listing.');

  const listingRef = doc(db, 'foodListings', listingId);
  const cleanTitle = input.title.trim();
  if (
    input.quantity !== undefined &&
    (!Number.isInteger(input.quantity) || input.quantity <= 0)
  ) {
    throw new Error('Quantity must be a positive integer.');
  }
  if (!cleanTitle || cleanTitle.length > 120) {
    throw new Error('Listing title must be between 1 and 120 characters.');
  }

  const updates: Record<string, any> = {
    title: cleanTitle,
    updatedAt: serverTimestamp(),
  };

  if (input.description !== undefined)
    updates.description = input.description.trim().slice(0, 1000);
  if (input.category !== undefined)
    updates.category = input.category.trim().slice(0, 50);
  if (typeof input.quantity === 'number' && input.quantity > 0)
    updates.quantity = Math.floor(input.quantity);
  if (input.unit !== undefined) updates.unit = input.unit;
  if (input.storageRequirement !== undefined)
    updates.storageRequirement = input.storageRequirement;
  if (input.storageInstructions !== undefined)
    updates.storageInstructions = input.storageInstructions
      .trim()
      .slice(0, 500);
  if (input.allergenInfo !== undefined)
    updates.allergenInfo = input.allergenInfo.trim().slice(0, 500);
  if (input.allergenDeclaration !== undefined)
    updates.allergenDeclaration = input.allergenDeclaration;
  if (input.pickupAddress !== undefined)
    updates.pickupAddress = input.pickupAddress.trim().slice(0, 200);
  if (input.pickupLocation) {
    updates.pickupLocation = new GeoPoint(
      input.pickupLocation.latitude,
      input.pickupLocation.longitude,
    );
  }
  if (input.pickupStartsAt)
    updates.pickupStartsAt = Timestamp.fromDate(input.pickupStartsAt);
  if (input.pickupDeadline)
    updates.pickupDeadline = Timestamp.fromDate(input.pickupDeadline);
  if (input.bestBeforeAt)
    updates.bestBeforeAt = Timestamp.fromDate(input.bestBeforeAt);
  if (input.useByAt) updates.useByAt = Timestamp.fromDate(input.useByAt);
  if (input.useByAt === null) updates.useByAt = deleteField();
  if (input.pickupLocation === null) updates.pickupLocation = deleteField();
  if (input.pickupStartsAt === null) updates.pickupStartsAt = deleteField();
  if (input.pickupDeadline === null) updates.pickupDeadline = deleteField();
  if (input.bestBeforeAt === null) updates.bestBeforeAt = deleteField();
  if (input.demoImageKey !== undefined)
    updates.demoImageKey = input.demoImageKey.trim().slice(0, 100);

  await updateDoc(listingRef, updates);
}

export async function publishListing(
  listingId: string,
  input: PublishListingInput,
): Promise<void> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before publishing a listing.');

  const cleanTitle = input.title.trim();
  const cleanDescription = input.description.trim();
  const cleanCategory = input.category.trim();
  const cleanAddress = input.pickupAddress.trim();

  if (!cleanTitle || cleanTitle.length > 120)
    throw new Error('Valid title up to 120 characters is required.');
  if (!cleanDescription || cleanDescription.length > 1000)
    throw new Error('Valid description up to 1000 characters is required.');
  if (!(FOOD_CATEGORIES as readonly string[]).includes(cleanCategory))
    throw new Error('Category is required.');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    throw new Error('Quantity must be greater than zero.');
  if (!cleanAddress || cleanAddress.length > 200)
    throw new Error('Valid pickup address is required.');
  if (
    !input.pickupLocation ||
    isNaN(input.pickupLocation.latitude) ||
    isNaN(input.pickupLocation.longitude)
  ) {
    throw new Error('Valid pickup location coordinates are required.');
  }
  if (input.pickupStartsAt >= input.pickupDeadline) {
    throw new Error('Pickup start time must be before pickup deadline.');
  }
  if (input.useByAt && input.pickupDeadline > input.useByAt) {
    throw new Error('Pickup deadline must not exceed use-by date.');
  }

  const listingRef = doc(db, 'foodListings', listingId);

  const payload: Record<string, any> = {
    title: cleanTitle,
    description: cleanDescription,
    category: cleanCategory,
    quantity: Math.floor(input.quantity),
    unit: input.unit,
    storageRequirement: input.storageRequirement,
    storageInstructions: input.storageInstructions.trim().slice(0, 500),
    allergenInfo: input.allergenInfo.trim().slice(0, 500),
    allergenDeclaration: input.allergenDeclaration,
    pickupAddress: cleanAddress,
    pickupLocation: new GeoPoint(
      input.pickupLocation.latitude,
      input.pickupLocation.longitude,
    ),
    pickupStartsAt: Timestamp.fromDate(input.pickupStartsAt),
    pickupDeadline: Timestamp.fromDate(input.pickupDeadline),
    status: 'open',
    updatedAt: serverTimestamp(),
  };

  if (input.bestBeforeAt)
    payload.bestBeforeAt = Timestamp.fromDate(input.bestBeforeAt);
  if (input.useByAt) payload.useByAt = Timestamp.fromDate(input.useByAt);
  if (input.demoImageKey)
    payload.demoImageKey = input.demoImageKey.trim().slice(0, 100);

  await updateDoc(listingRef, payload);
}

export async function cancelListing(listingId: string): Promise<void> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before cancelling a listing.');

  const listingRef = doc(db, 'foodListings', listingId);
  await updateDoc(listingRef, {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
}

export async function uploadListingPhoto(
  listingId: string,
  jpegBytes: Uint8Array | string,
): Promise<void> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before uploading a listing photo.');

  let bytesObj: Bytes;
  let byteLength = 0;

  if (typeof jpegBytes === 'string') {
    bytesObj = Bytes.fromBase64String(jpegBytes);
    byteLength = bytesObj.toUint8Array().byteLength;
  } else {
    bytesObj = Bytes.fromUint8Array(jpegBytes);
    byteLength = jpegBytes.byteLength;
  }

  if (byteLength === 0 || byteLength > MAX_PHOTO_BYTES) {
    throw new Error(
      `Photo size (${Math.round(byteLength / 1024)} KiB) exceeds the 150 KiB limit.`,
    );
  }

  const photoRef = doc(db, 'foodListings', listingId, 'photos', 'primary');
  await setDoc(photoRef, {
    jpeg: bytesObj,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteListingPhoto(listingId: string): Promise<void> {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before deleting a listing photo.');

  const photoRef = doc(db, 'foodListings', listingId, 'photos', 'primary');
  await deleteDoc(photoRef);
}

export async function getListingPhotoBase64(
  listingId: string,
): Promise<string | null> {
  const { db } = getFirebaseClients();
  const photoRef = doc(db, 'foodListings', listingId, 'photos', 'primary');
  const snap = await getDoc(photoRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data?.jpeg) return null;
  return (data.jpeg as Bytes).toBase64();
}

export async function getListingById(
  listingId: string,
): Promise<FoodListing | null> {
  const { db } = getFirebaseClients();
  const listingRef = doc(db, 'foodListings', listingId);
  const snap = await getDoc(listingRef);
  if (!snap.exists()) return null;
  return convertDocToListing(snap.id, snap.data());
}

export interface ListingPage {
  fromCache: boolean;
  hasPendingWrites: boolean;
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
}
export interface ListingPageOptions {
  after?: QueryDocumentSnapshot<DocumentData>;
}

export function subscribeToOpenListings(
  onUpdate: (listings: FoodListing[], page: ListingPage) => void,
  onError?: (error: Error) => void,
  options: ListingPageOptions = {},
): Unsubscribe {
  const { db } = getFirebaseClients();
  let stop: Unsubscribe | undefined;
  let active = true;
  function listen() {
    stop?.();
    const q = query(
      collection(db, 'foodListings'),
      where('status', '==', 'open'),
      where('pickupDeadline', '>', Timestamp.now()),
      orderBy('pickupDeadline', 'asc'),
      ...(options.after ? [startAfter(options.after)] : []),
      limit(50),
    );
    stop = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active) return;
        const items = snapshot.docs
          .map((record) => convertDocToListing(record.id, record.data()))
          .filter(
            (item) =>
              item.pickupDeadline && item.pickupDeadline.getTime() > Date.now(),
          );
        onUpdate(items, {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          nextCursor: snapshot.docs.length === 50 ? snapshot.docs[49] : null,
        });
      },
      onError,
    );
  }
  listen();
  // Refresh the moving deadline bound even when Firestore has no document updates.
  const timer = setInterval(listen, 30_000);
  return () => {
    active = false;
    clearInterval(timer);
    stop?.();
  };
}

export function subscribeToProviderListings(
  providerUid: string,
  onUpdate: (listings: FoodListing[], page: ListingPage) => void,
  onError?: (error: Error) => void,
  options: ListingPageOptions = {},
): Unsubscribe {
  const { db } = getFirebaseClients();
  const q = query(
    collection(db, 'foodListings'),
    where('providerUid', '==', providerUid),
    orderBy('createdAt', 'desc'),
    ...(options.after ? [startAfter(options.after)] : []),
    limit(50),
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      onUpdate(
        snapshot.docs.map((record) =>
          convertDocToListing(record.id, record.data()),
        ),
        {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          nextCursor: snapshot.docs.length === 50 ? snapshot.docs[49] : null,
        },
      );
    },
    onError,
  );
}

export function subscribeToListing(
  listingId: string,
  onUpdate: (
    listing: FoodListing | null,
    metadata: Pick<ListingPage, 'fromCache' | 'hasPendingWrites'>,
  ) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'foodListings', listingId),
    { includeMetadataChanges: true },
    (snapshot) => {
      onUpdate(
        snapshot.exists()
          ? convertDocToListing(snapshot.id, snapshot.data())
          : null,
        {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        },
      );
    },
    onError,
  );
}

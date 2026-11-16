import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  Timestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { validateReviewReason } from './review-validation';
export { validateReviewReason } from './review-validation';
import { getFirebaseClients } from './firebase';

export interface AdminAuditRecord {
  id: string;
  action: string;
  adminUid: string;
  targetUid: string;
  reason: string;
  previousStatus: 'pending' | 'approved' | 'rejected' | string;
  newStatus: 'approved' | 'rejected' | string;
  createdAt: Timestamp | null;
}

export function profilesQuery(cursor?: string) {
  const { db } = getFirebaseClients();
  return query(
    collection(db, 'profiles'),
    orderBy('__name__'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(50),
  );
}

export function profileReviewHistoryQuery() {
  const { db } = getFirebaseClients();
  return query(
    collection(db, 'adminAuditLogs'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
}

export function profileAuditsQuery(
  targetUid: string,
  cursor?: QueryDocumentSnapshot<DocumentData>,
) {
  const { db } = getFirebaseClients();
  return query(
    collection(db, 'adminAuditLogs'),
    where('targetUid', '==', targetUid),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(50),
  );
}

export async function reviewProfile(
  targetUid: string,
  decision: 'approved' | 'rejected',
  reason: string,
) {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Sign in before reviewing a profile.');

  const validation = validateReviewReason(decision, reason);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleanReason = reason.trim();
  const profileRef = doc(db, 'profiles', targetUid);
  const auditRef = doc(collection(db, 'adminAuditLogs'));
  await runTransaction(db, async (transaction) => {
    const profile = await transaction.get(profileRef);
    if (!profile.exists()) {
      throw new Error('This profile no longer exists.');
    }
    transaction.update(profileRef, {
      verificationStatus: decision,
      lastAuditId: auditRef.id,
      rejectionReason: decision === 'rejected' ? cleanReason : '',
    });
    transaction.set(auditRef, {
      action: 'review_profile',
      adminUid,
      targetUid,
      reason: decision === 'rejected' ? cleanReason : '',
      previousStatus: profile.data()!.verificationStatus,
      newStatus: decision,
      createdAt: serverTimestamp(),
    });
  });
}

import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
} from 'firebase/firestore';
import { getFirebaseClients } from './firebase';

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

export async function reviewProfile(
  targetUid: string,
  decision: 'approved' | 'rejected',
  reason: string,
) {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Sign in before reviewing a profile.');

  const cleanReason = reason.trim();
  if ((decision === 'rejected' && !cleanReason) || cleanReason.length > 500) {
    throw new Error('Enter a review reason up to 500 characters.');
  }

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
      reason: cleanReason,
      previousStatus: profile.data()!.verificationStatus,
      newStatus: decision,
      createdAt: serverTimestamp(),
    });
  });
}

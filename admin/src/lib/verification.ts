import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { getFirebaseClients } from './firebase';

export function pendingProfilesQuery() {
  const { db } = getFirebaseClients();
  return query(
    collection(db, 'profiles'),
    where('verificationStatus', '==', 'pending'),
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
  if (!cleanReason || cleanReason.length > 500) {
    throw new Error('Enter a review reason up to 500 characters.');
  }

  const profileRef = doc(db, 'profiles', targetUid);
  const auditRef = doc(collection(db, 'adminAuditLogs'));
  await runTransaction(db, async (transaction) => {
    const profile = await transaction.get(profileRef);
    if (profile.data()?.verificationStatus !== 'pending') {
      throw new Error('This profile is no longer pending.');
    }
    transaction.update(profileRef, {
      verificationStatus: decision,
      lastAuditId: auditRef.id,
    });
    transaction.set(auditRef, {
      action: 'review_profile',
      adminUid,
      targetUid,
      reason: cleanReason,
      previousStatus: 'pending',
      newStatus: decision,
      createdAt: serverTimestamp(),
    });
  });
}

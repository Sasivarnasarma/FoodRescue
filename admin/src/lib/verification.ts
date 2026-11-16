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
} from 'firebase/firestore';
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

export function validateReviewReason(
  decision: 'approved' | 'rejected',
  reason: string,
): { valid: boolean; error?: string } {
  const clean = reason.trim();
  if (decision === 'rejected') {
    if (!clean) {
      return {
        valid: false,
        error: 'Enter a review reason up to 500 characters.',
      };
    }
    if (clean.length > 500) {
      return {
        valid: false,
        error: 'Enter a review reason up to 500 characters.',
      };
    }
  } else {
    if (clean.length > 500) {
      return {
        valid: false,
        error: 'Reason must not exceed 500 characters.',
      };
    }
  }
  return { valid: true };
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

export function profileAuditsQuery(targetUid: string) {
  const { db } = getFirebaseClients();
  return query(
    collection(db, 'adminAuditLogs'),
    where('targetUid', '==', targetUid),
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

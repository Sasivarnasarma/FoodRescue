import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { getFirebaseClients } from '@/lib/firebase';

type ObservedDocument = {
  data: DocumentData | undefined;
  fromCache: boolean;
};

export function useDonorProfile(uid: string) {
  const [account, setAccount] = useState<ObservedDocument | null>(null);
  const [profile, setProfile] = useState<ObservedDocument | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const { db } = getFirebaseClients();
    const subscriptions = [
      onSnapshot(
        doc(db, 'users', uid),
        { includeMetadataChanges: true },
        (snapshot) =>
          setAccount({
            data: snapshot.data(),
            fromCache: snapshot.metadata.fromCache,
          }),
        setError,
      ),
      onSnapshot(
        doc(db, 'profiles', uid),
        { includeMetadataChanges: true },
        (snapshot) =>
          setProfile({
            data: snapshot.data(),
            fromCache: snapshot.metadata.fromCache,
          }),
        setError,
      ),
    ];
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [uid, attempt]);

  return {
    account,
    profile,
    error,
    retry() {
      setAccount(null);
      setProfile(null);
      setError(null);
      setAttempt((value) => value + 1);
    },
  };
}

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, View } from 'react-native';
import { AccountError } from './donor-controls';
import { QrScannerCard } from './qr-scanner-card';
import { getFirebaseClients } from '@/lib/firebase';
import { getListingById, type FoodListing } from '@/lib/listings';

export interface DonorPickupScannerProps {
  visible: boolean;
  onClose: () => void;
  onSelectListing: (listing: FoodListing) => void;
}

export function DonorPickupScanner({
  visible,
  onClose,
  onSelectListing,
}: DonorPickupScannerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!visible) {
      generation.current += 1;
      lock.current = false;
      Promise.resolve().then(() => setBusy(false));
    }
  }, [visible]);
  const close = () => {
    generation.current += 1;
    lock.current = false;
    setBusy(false);
    setError('');
    setAttempt((v) => v + 1);
    onClose();
  };
  const lookup = async (listingId: string) => {
    if (lock.current || !visible) return;
    lock.current = true;
    const token = generation.current;
    setBusy(true);
    setError('');
    try {
      const { auth } = getFirebaseClients();
      await auth.authStateReady();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign in before verifying pickups.');
      const listing = await getListingById(listingId);
      if (token !== generation.current) return;
      if (!listing)
        throw new Error(
          'Donation not found. Verify the reference and try again.',
        );
      if (listing.providerUid !== uid)
        throw new Error('You can only manage pickups for your own donations.');
      onSelectListing(listing);
      close();
    } catch (cause) {
      if (token === generation.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load this donation. Retry.',
        );
        setAttempt((v) => v + 1);
      }
    } finally {
      if (token === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      {visible && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          {error ? <AccountError message={error} /> : null}
          {busy ? (
            <View>
              <ActivityIndicator />
              <Text>Checking donation ownership…</Text>
            </View>
          ) : null}
          <QrScannerCard
            key={attempt}
            disabled={busy}
            onCancel={close}
            onScanSuccess={(id) => {
              void lookup(id);
            }}
          />
        </ScrollView>
      )}
    </Modal>
  );
}

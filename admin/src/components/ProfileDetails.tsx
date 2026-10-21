import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import {
  doc,
  onSnapshot,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getFirebaseClients } from '../lib/firebase';

function Fields({ data }: { data: DocumentData }) {
  return (
    <Stack spacing={1}>
      {Object.entries(data).map(([key, value]) => (
        <Typography key={key} sx={{ overflowWrap: 'anywhere' }}>
          <strong>{key.replace(/([A-Z])/g, ' $1')}: </strong>
          {value instanceof Timestamp
            ? value.toDate().toLocaleString()
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value ?? '—')}
        </Typography>
      ))}
    </Stack>
  );
}

export default function ProfileDetails({
  uid,
  onClose,
}: {
  uid: string;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<Record<string, DocumentData | null>>(
    {},
  );
  const [error, setError] = useState('');
  useEffect(() => {
    const { db } = getFirebaseClients();
    const stops = ['profiles', 'users'].map((collection) =>
      onSnapshot(
        doc(db, collection, uid),
        (snapshot) =>
          setRecords((previous) => ({
            ...previous,
            [collection]: snapshot.data() ?? null,
          })),
        () => setError('Could not load profile details. Close and try again.'),
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [uid]);
  return (
    <Dialog open fullWidth onClose={onClose} aria-labelledby="profile-title">
      <DialogTitle id="profile-title">Profile details</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>Account UID {uid}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {['profiles', 'users'].map((collection) => (
            <Stack key={collection} spacing={1}>
              <Typography variant="h6">
                {collection === 'profiles' ? 'Profile' : 'Account'}
              </Typography>
              {records[collection] === undefined ? (
                <CircularProgress aria-label="Loading details" />
              ) : records[collection] === null ? (
                <Typography>No record available.</Typography>
              ) : (
                <Fields data={records[collection]} />
              )}
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

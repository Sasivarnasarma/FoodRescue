import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { firebaseErrorMessage } from '../lib/error-message';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseClients } from '../lib/firebase';
import { isReviewableSnapshot } from '../lib/review-validation';
import { reviewProfile, validateReviewReason } from '../lib/verification';

export type Decision = 'approved' | 'rejected';
export type PendingProfile = {
  uid: string;
  name: string;
  role: string;
  currentStatus?: string;
  previousReason?: string;
};

export default function ReviewDialog({
  profile,
  decision,
  available,
  onClose,
  onDone,
}: {
  profile: PendingProfile;
  decision: Decision;
  available: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [source, setSource] = useState<{
    data: Record<string, unknown> | null;
    fromCache: boolean;
    hasPendingWrites: boolean;
    error?: string;
  }>();
  const lock = useRef(false);
  useEffect(() => {
    const { db } = getFirebaseClients();
    return onSnapshot(
      doc(db, 'profiles', profile.uid),
      { includeMetadataChanges: true },
      (snapshot) => {
        setSource({
          data: snapshot.data() ?? null,
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        });
      },
      () =>
        setSource({
          data: null,
          fromCache: true,
          hasPendingWrites: false,
          error: 'Could not load current profile. Close and retry.',
        }),
    );
  }, [profile.uid]);
  const ready =
    available &&
    !!source &&
    !source.error &&
    isReviewableSnapshot(source.data, source);
  const previousReason =
    typeof source?.data?.rejectionReason === 'string'
      ? source.data.rejectionReason
      : '';
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const verb = decision === 'approved' ? 'Approve' : 'Reject';
  const cleanReason = reason.trim();
  const validation = validateReviewReason(decision, reason);
  const validReason = validation.valid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validReason || !ready || pending || lock.current) return;
    lock.current = true;

    setError('');
    setPending(true);
    try {
      await reviewProfile(profile.uid, decision, cleanReason);
      onDone();
    } catch (cause) {
      setError(
        firebaseErrorMessage(
          cause,
          'The review could not be saved. Try again.',
        ),
      );
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      aria-labelledby="review-dialog-title"
      onClose={pending ? undefined : onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <DialogTitle id="review-dialog-title">{verb} profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              {verb} {profile.name} ({profile.role}). This decision is recorded
              in the audit history.
            </Typography>

            {previousReason && (
              <Alert severity="info">
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, display: 'block' }}
                >
                  Previous Rejection Feedback:
                </Typography>
                <Typography variant="body2">{previousReason}</Typography>
              </Alert>
            )}

            {decision === 'approved' && (
              <Alert severity="success">
                Approving this profile will grant verification to the account
                and clear any previous rejection feedback.
              </Alert>
            )}

            {!ready && !pending && (
              <Alert severity="warning">
                Waiting for current profile information. Reconnect or close and
                retry if the profile is unavailable.
              </Alert>
            )}

            {source?.error && <Alert severity="error">{source.error}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            {decision === 'rejected' && (
              <Box>
                <TextField
                  label="Rejection reason / feedback"
                  name="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={pending}
                  required
                  fullWidth
                  multiline
                  minRows={2}
                  autoFocus
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                  helperText={`${reason.length}/500 characters${validation.error ? ` — ${validation.error}` : ``}`}
                  error={!validation.valid && reason.length > 0}
                />
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={decision === 'approved' ? 'primary' : 'error'}
            disabled={!validReason || !ready}
            loading={pending}
          >
            Confirm {verb.toLowerCase()}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

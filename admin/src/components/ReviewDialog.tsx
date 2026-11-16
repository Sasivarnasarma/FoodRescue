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
      slotProps={{
        paper: {
          sx: {
            borderRadius: '6px',
            border: '1px solid #E2E8F0',
          },
        },
      }}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <DialogTitle
          id="review-dialog-title"
          sx={{
            fontWeight: 700,
            fontSize: '1rem',
            color: '#0F172A',
            borderBottom: '1px solid #E2E8F0',
            py: 1.75,
            px: 3,
          }}
        >
          {verb} Organization Registration
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 2.5 }}>
          <Stack spacing={2}>
            <Box
              sx={{
                p: 2,
                borderRadius: '4px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
              }}
            >
              <Typography variant="body2" sx={{ color: '#334155' }}>
                You are about to{' '}
                {decision === 'approved' ? 'approve' : 'reject'}{' '}
                <strong>{profile.name}</strong> ({profile.role}). This action
                will be permanently logged in the audit trail.
              </Typography>
            </Box>

            {previousReason && (
              <Alert severity="info" sx={{ borderRadius: '4px' }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, display: 'block' }}
                >
                  Previous Rejection Reason:
                </Typography>
                <Typography variant="body2">{previousReason}</Typography>
              </Alert>
            )}

            {decision === 'approved' && (
              <Alert severity="success" sx={{ borderRadius: '4px' }}>
                Approving this profile grants verification to the account and
                clears any previous rejection feedback.
              </Alert>
            )}

            {!ready && !pending && (
              <Alert severity="warning" sx={{ borderRadius: '4px' }}>
                Waiting for current profile information from server…
              </Alert>
            )}

            {source?.error && (
              <Alert severity="error" sx={{ borderRadius: '4px' }}>
                {source.error}
              </Alert>
            )}
            {error && (
              <Alert severity="error" sx={{ borderRadius: '4px' }}>
                {error}
              </Alert>
            )}

            {decision === 'rejected' && (
              <Box sx={{ mt: 1 }}>
                <TextField
                  label="Rejection feedback / reason"
                  name="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={pending}
                  required
                  fullWidth
                  multiline
                  minRows={3}
                  autoFocus
                  slotProps={{
                    htmlInput: { maxLength: 500 },
                  }}
                  helperText={`${reason.length}/500 characters${validation.error ? ` — ${validation.error}` : ''}`}
                  error={!validation.valid && reason.length > 0}
                />
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            py: 1.5,
            px: 3,
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#FAFAFA',
          }}
        >
          <Button
            onClick={onClose}
            disabled={pending}
            variant="outlined"
            size="small"
            sx={{ color: '#475569' }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            size="small"
            color={decision === 'approved' ? 'primary' : 'error'}
            disabled={!validReason || !ready}
            loading={pending}
            sx={
              decision === 'approved'
                ? {
                    backgroundColor: '#167044',
                    '&:hover': { backgroundColor: '#115533' },
                  }
                : undefined
            }
          >
            Confirm {verb}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

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
import { type FormEvent, useState } from 'react';
import { firebaseErrorMessage } from '../lib/error-message';
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
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const verb = decision === 'approved' ? 'Approve' : 'Reject';
  const cleanReason = reason.trim();
  const validation = validateReviewReason(decision, reason);
  const validReason = validation.valid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validReason || !available || pending) return;

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

            {profile.previousReason && (
              <Alert severity="info">
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, display: 'block' }}
                >
                  Previous Rejection Feedback:
                </Typography>
                <Typography variant="body2">
                  {profile.previousReason}
                </Typography>
              </Alert>
            )}

            {decision === 'approved' && (
              <Alert severity="success">
                Approving this profile will grant verification to the account
                and clear any previous rejection feedback.
              </Alert>
            )}

            {!available && !pending && (
              <Alert severity="warning">
                This profile is no longer in the current queue, or the
                connection was lost. Check the queue before continuing.
              </Alert>
            )}

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
                  helperText={
                    validation.error
                      ? validation.error
                      : `${reason.length}/500 characters`
                  }
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
            disabled={!validReason || !available}
            loading={pending}
          >
            Confirm {verb.toLowerCase()}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

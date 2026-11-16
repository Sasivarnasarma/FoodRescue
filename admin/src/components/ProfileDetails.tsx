import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
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
import { profileAuditsQuery, type AdminAuditRecord } from '../lib/verification';
import type { Decision, PendingProfile } from './ReviewDialog';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

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
  onReview,
  canReview = false,
}: {
  uid: string;
  onClose: () => void;
  onReview?: (profile: PendingProfile, decision: Decision) => void;
  canReview?: boolean;
}) {
  const [records, setRecords] = useState<Record<string, DocumentData | null>>(
    {},
  );
  const [audits, setAudits] = useState<AdminAuditRecord[]>([]);
  const [auditsLoading, setAuditsLoading] = useState(true);
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

    const auditStop = onSnapshot(
      profileAuditsQuery(uid),
      (snapshot) => {
        const list: AdminAuditRecord[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            action: String(data.action ?? ''),
            adminUid: String(data.adminUid ?? ''),
            targetUid: String(data.targetUid ?? ''),
            reason: String(data.reason ?? ''),
            previousStatus: String(data.previousStatus ?? ''),
            newStatus: String(data.newStatus ?? ''),
            createdAt:
              data.createdAt instanceof Timestamp ? data.createdAt : null,
          };
        });
        // Sort descending by createdAt in memory (safe without composite index)
        list.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() ?? 0;
          const timeB = b.createdAt?.toMillis() ?? 0;
          return timeB - timeA;
        });
        setAudits(list);
        setAuditsLoading(false);
      },
      () => {
        setAuditsLoading(false);
      },
    );

    return () => {
      stops.forEach((stop) => stop());
      auditStop();
    };
  }, [uid]);

  const profile = records.profiles;
  const user = records.users;
  const name =
    typeof profile?.name === 'string'
      ? profile.name
      : typeof user?.displayName === 'string'
        ? user.displayName
        : 'Unnamed profile';
  const role =
    profile?.type === 'provider'
      ? 'Donor business'
      : profile?.type === 'organization'
        ? 'Recipient organization'
        : String(user?.role ?? 'Unknown');
  const status = String(profile?.verificationStatus ?? 'pending');
  const rejectionReason =
    typeof profile?.rejectionReason === 'string' ? profile.rejectionReason : '';
  const lastAuditId =
    typeof profile?.lastAuditId === 'string' ? profile.lastAuditId : '';

  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      onClose={onClose}
      aria-labelledby="profile-title"
    >
      <DialogTitle id="profile-title">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{
            justifyContent: 'space-between',
            alignItems: { sm: 'center' },
          }}
        >
          <Box>
            <Typography variant="h6" component="div">
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {role} • UID {uid}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={
              status === 'approved'
                ? 'Approved'
                : status === 'rejected'
                  ? 'Rejected'
                  : 'Pending review'
            }
            color={
              status === 'approved'
                ? 'success'
                : status === 'rejected'
                  ? 'error'
                  : 'warning'
            }
          />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Verification feedback section */}
          {status === 'rejected' && (
            <Alert severity="error">
              <Typography sx={{ fontWeight: 600 }}>
                Verification Feedback (Rejected)
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {rejectionReason || 'No rejection reason was recorded.'}
              </Typography>
              {lastAuditId && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  Recorded in audit record: {lastAuditId}
                </Typography>
              )}
            </Alert>
          )}

          {status === 'approved' && (
            <Alert severity="success">
              <Typography sx={{ fontWeight: 600 }}>
                Profile Verified & Approved
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                This account is active and verified to participate in food
                rescue donations.
              </Typography>
              {lastAuditId && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  Latest approval audit: {lastAuditId}
                </Typography>
              )}
            </Alert>
          )}

          {status === 'pending' && (
            <Alert severity="warning">
              <Typography sx={{ fontWeight: 600 }}>
                Pending Verification
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                This account has submitted profile details and is awaiting
                administrator review.
              </Typography>
            </Alert>
          )}

          {/* Stored document fields */}
          <Stack spacing={2}>
            {['profiles', 'users'].map((collection) => (
              <Box key={collection}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {collection === 'profiles'
                    ? 'Profile Document Details'
                    : 'User Account Details'}
                </Typography>
                {records[collection] === undefined ? (
                  <CircularProgress size={20} aria-label="Loading details" />
                ) : records[collection] === null ? (
                  <Typography variant="body2" color="text.secondary">
                    No record available.
                  </Typography>
                ) : (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                    <Fields data={records[collection]} />
                  </Paper>
                )}
              </Box>
            ))}
          </Stack>

          <Divider />

          {/* Audit trail for this profile */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Audit History & Review Trail
            </Typography>
            {auditsLoading ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress
                  size={18}
                  aria-label="Loading audit history"
                />
                <Typography variant="body2" color="text.secondary">
                  Loading audit trail…
                </Typography>
              </Stack>
            ) : audits.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No audit records recorded for this profile yet.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {audits.map((item) => (
                  <Paper
                    key={item.id}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 1 }}
                  >
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      sx={{
                        justifyContent: 'space-between',
                        alignItems: { sm: 'center' },
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'center' }}
                      >
                        <Chip
                          size="small"
                          label={
                            item.newStatus === 'approved'
                              ? 'Approved'
                              : 'Rejected'
                          }
                          color={
                            item.newStatus === 'approved' ? 'success' : 'error'
                          }
                        />
                        <Typography variant="caption" color="text.secondary">
                          ({item.previousStatus} → {item.newStatus})
                        </Typography>
                      </Stack>
                      {item.createdAt && (
                        <Typography variant="caption" color="text.secondary">
                          {dateFormat.format(item.createdAt.toDate())}
                        </Typography>
                      )}
                    </Stack>
                    {item.reason && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        <strong>Feedback:</strong> {item.reason}
                      </Typography>
                    )}
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                      sx={{ mt: 1 }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Reviewed by {item.adminUid}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Audit ID {item.id}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Box>
          {onReview && canReview && (
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={() => {
                  onReview({ uid, name, role }, 'rejected');
                }}
              >
                Reject
              </Button>
              <Button
                variant="contained"
                color="primary"
                size="small"
                onClick={() => {
                  onReview({ uid, name, role }, 'approved');
                }}
              >
                Approve
              </Button>
            </Stack>
          )}
        </Box>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

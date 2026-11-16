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
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getFirebaseClients } from '../lib/firebase';
import { profileAuditsQuery, type AdminAuditRecord } from '../lib/verification';
import { isReviewableSnapshot } from '../lib/review-validation';
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
  const [attempt, setAttempt] = useState(0);
  const [recordMeta, setRecordMeta] = useState<
    Record<string, { fromCache: boolean; hasPendingWrites: boolean }>
  >({});
  const [auditError, setAuditError] = useState('');
  const [auditCached, setAuditCached] = useState(true);
  const [cursors, setCursors] = useState<QueryDocumentSnapshot<DocumentData>[]>(
    [],
  );
  const cursor = cursors[cursors.length - 1];
  const [nextCursor, setNextCursor] =
    useState<QueryDocumentSnapshot<DocumentData>>();

  useEffect(() => {
    let active = true;
    const { db } = getFirebaseClients();
    const stops: (() => void)[] = [];
    Promise.resolve().then(() => {
      if (!active) return;
      setError('');
      setRecordMeta({});
      for (const collection of ['profiles', 'users']) {
        stops.push(
          onSnapshot(
            doc(db, collection, uid),
            { includeMetadataChanges: true },
            (snapshot) => {
              if (!active) return;
              setRecords((previous) => ({
                ...previous,
                [collection]: snapshot.data() ?? null,
              }));
              setRecordMeta((previous) => ({
                ...previous,
                [collection]: {
                  fromCache: snapshot.metadata.fromCache,
                  hasPendingWrites: snapshot.metadata.hasPendingWrites,
                },
              }));
            },
            () => {
              if (active) setError('Could not load profile details. Retry.');
            },
          ),
        );
      }
    });
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [uid, attempt]);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setAuditsLoading(true);
        setAuditError('');
        stop = onSnapshot(
          profileAuditsQuery(uid, cursor),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!active) return;
            setAudits(
              snapshot.docs.map((item) => {
                const data = item.data();
                return {
                  id: item.id,
                  action: String(data.action ?? ''),
                  adminUid: String(data.adminUid ?? ''),
                  targetUid: String(data.targetUid ?? ''),
                  reason: String(data.reason ?? ''),
                  previousStatus: String(data.previousStatus ?? ''),
                  newStatus: String(data.newStatus ?? ''),
                  createdAt:
                    data.createdAt instanceof Timestamp ? data.createdAt : null,
                };
              }),
            );
            setNextCursor(
              snapshot.docs.length === 50 ? snapshot.docs[49] : undefined,
            );
            setAuditCached(
              snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites,
            );
            setAuditsLoading(false);
          },
          () => {
            if (!active) return;
            setAuditError(
              'Could not load audit history. Check deployment of the audit index and retry.',
            );
            setAuditsLoading(false);
          },
        );
      })
      .catch(() => {
        if (active) {
          setAuditError('Could not load audit history. Retry.');
          setAuditsLoading(false);
        }
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [uid, cursor, attempt]);
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
  const readyToReview =
    canReview &&
    !error &&
    isReviewableSnapshot(
      profile,
      recordMeta.profiles ?? { fromCache: true, hasPendingWrites: false },
    );
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
          {error && (
            <Alert
              severity="error"
              action={
                <Button onClick={() => setAttempt((v) => v + 1)}>Retry</Button>
              }
            >
              {error}
            </Alert>
          )}
          {!recordMeta.profiles ||
          recordMeta.profiles.fromCache ||
          recordMeta.profiles.hasPendingWrites ? (
            <Alert severity="info">
              Waiting for current profile information. Saved details may be out
              of date.
            </Alert>
          ) : null}

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
                This profile is approved. Participation also requires an active
                account; approval does not reactivate a suspended account.
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
              Audit History & Review Trail — page {cursors.length + 1}
            </Typography>
            {auditCached && !auditsLoading && !auditError ? (
              <Alert severity="info">
                Showing saved audit history. It may be out of date.
              </Alert>
            ) : null}
            {auditError ? (
              <Alert
                severity="error"
                action={
                  <Button onClick={() => setAttempt((v) => v + 1)}>
                    Retry
                  </Button>
                }
              >
                {auditError}
              </Alert>
            ) : auditsLoading ? (
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
                {cursor
                  ? 'No older reviews on this page.'
                  : auditCached
                    ? 'No audit history is available offline.'
                    : 'No reviews have been recorded for this profile.'}
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
          <Stack direction="row" spacing={1}>
            <Button
              disabled={auditsLoading || cursors.length === 0}
              onClick={() => setCursors((v) => v.slice(0, -1))}
            >
              Previous reviews
            </Button>
            <Button
              disabled={
                auditsLoading || !nextCursor || auditCached || !!auditError
              }
              onClick={() => {
                if (nextCursor) setCursors((v) => [...v, nextCursor]);
              }}
            >
              Older reviews
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Box>
          {onReview && (
            <Stack direction="row" spacing={1}>
              <Button
                disabled={!readyToReview}
                variant="outlined"
                color="error"
                size="small"
                onClick={() => {
                  onReview(
                    {
                      uid,
                      name,
                      role,
                      currentStatus: status,
                      previousReason: rejectionReason,
                    },
                    'rejected',
                  );
                }}
              >
                Reject
              </Button>
              <Button
                disabled={!readyToReview}
                variant="contained"
                color="primary"
                size="small"
                onClick={() => {
                  onReview(
                    {
                      uid,
                      name,
                      role,
                      currentStatus: status,
                      previousReason: rejectionReason,
                    },
                    'approved',
                  );
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

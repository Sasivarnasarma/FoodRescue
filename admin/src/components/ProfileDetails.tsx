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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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

function PropertyTable({ data }: { data: DocumentData }) {
  const entries = Object.entries(data);
  return (
    <Box
      sx={{
        border: '1px solid #E2E8F0',
        borderRadius: '4px',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      }}
    >
      <Table size="small">
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key} sx={{ '&:last-child td': { borderBottom: 0 } }}>
              <TableCell
                sx={{
                  width: '32%',
                  backgroundColor: '#F8FAFC',
                  fontWeight: 600,
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#475569',
                  borderRight: '1px solid #E2E8F0',
                  py: 1,
                  px: 1.5,
                }}
              >
                {key.replace(/([A-Z])/g, ' $1')}
              </TableCell>
              <TableCell
                sx={{
                  py: 1,
                  px: 1.5,
                  fontSize: '0.8125rem',
                  color: '#0F172A',
                  fontFamily:
                    typeof value === 'object' ||
                    key.toLowerCase().includes('id') ||
                    key.toLowerCase().includes('uid')
                      ? 'monospace'
                      : 'inherit',
                  overflowWrap: 'anywhere',
                }}
              >
                {value instanceof Timestamp
                  ? value.toDate().toLocaleString()
                  : typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value ?? '—')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
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
      slotProps={{
        paper: {
          sx: {
            borderRadius: '6px',
            border: '1px solid #E2E8F0',
          },
        },
      }}
    >
      <DialogTitle
        id="profile-title"
        sx={{
          p: 2.5,
          px: 3,
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#FAFAFA',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{
            justifyContent: 'space-between',
            alignItems: { sm: 'center' },
          }}
        >
          <Box>
            <Typography
              variant="subtitle1"
              component="div"
              sx={{ fontWeight: 700, color: '#0F172A' }}
            >
              {name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 500 }}
            >
              {role} •{' '}
              <span style={{ fontFamily: 'monospace' }}>UID: {uid}</span>
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
            sx={{
              borderRadius: '3px',
              fontWeight: 600,
              fontSize: '0.6875rem',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              ...(status === 'approved'
                ? {
                    backgroundColor: '#F0FDF4',
                    color: '#15803D',
                    border: '1px solid #BBF7D0',
                  }
                : status === 'rejected'
                  ? {
                      backgroundColor: '#FEF2F2',
                      color: '#B91C1C',
                      border: '1px solid #FECACA',
                    }
                  : {
                      backgroundColor: '#FFFBEB',
                      color: '#B45309',
                      border: '1px solid #FDE68A',
                    }),
            }}
          />
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          {error && (
            <Alert
              severity="error"
              action={
                <Button size="small" onClick={() => setAttempt((v) => v + 1)}>
                  Retry
                </Button>
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
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Verification Feedback (Rejected)
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {rejectionReason || 'No rejection reason was recorded.'}
              </Typography>
              {lastAuditId && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}
                >
                  Audit record: {lastAuditId}
                </Typography>
              )}
            </Alert>
          )}

          {status === 'approved' && (
            <Alert severity="success">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Profile Verified & Approved
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                This profile is approved. Organization accounts must also remain
                active to participate in food donations.
              </Typography>
              {lastAuditId && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}
                >
                  Approval audit reference: {lastAuditId}
                </Typography>
              )}
            </Alert>
          )}

          {status === 'pending' && (
            <Alert severity="warning">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Pending Verification
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                This account has submitted organization registration details and
                is awaiting administrator review.
              </Typography>
            </Alert>
          )}

          {/* Stored document fields */}
          <Stack spacing={2.5}>
            {['profiles', 'users'].map((collection) => (
              <Box key={collection}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    mb: 1,
                    color: '#0F172A',
                    fontSize: '0.8125rem',
                  }}
                >
                  {collection === 'profiles'
                    ? 'Profile Document Attributes'
                    : 'User Account Record'}
                </Typography>
                {records[collection] === undefined ? (
                  <Box sx={{ py: 2 }}>
                    <CircularProgress size={18} aria-label="Loading details" />
                  </Box>
                ) : records[collection] === null ? (
                  <Typography variant="body2" color="text.secondary">
                    No document record found.
                  </Typography>
                ) : (
                  <PropertyTable data={records[collection]} />
                )}
              </Box>
            ))}
          </Stack>

          <Divider sx={{ my: 1 }} />

          {/* Audit trail for this profile */}
          <Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: '#0F172A',
                  fontSize: '0.8125rem',
                }}
              >
                Audit History & Review Log (Page {cursors.length + 1})
              </Typography>
            </Stack>

            {auditCached && !auditsLoading && !auditError ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Showing cached audit history. It may be out of date.
              </Alert>
            ) : null}

            {auditError ? (
              <Alert
                severity="error"
                action={
                  <Button size="small" onClick={() => setAttempt((v) => v + 1)}>
                    Retry
                  </Button>
                }
              >
                {auditError}
              </Alert>
            ) : auditsLoading ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', py: 2 }}
              >
                <CircularProgress
                  size={16}
                  aria-label="Loading audit history"
                />
                <Typography variant="body2" color="text.secondary">
                  Loading audit trail…
                </Typography>
              </Stack>
            ) : audits.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                {cursor
                  ? 'No older reviews on this page.'
                  : auditCached
                    ? 'No audit history is available offline.'
                    : 'No reviews have been recorded for this profile.'}
              </Typography>
            ) : (
              <TableContainer
                sx={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px',
                  maxHeight: 280,
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ minWidth: 140 }}>Timestamp</TableCell>
                      <TableCell sx={{ minWidth: 90 }}>Decision</TableCell>
                      <TableCell sx={{ minWidth: 120 }}>Transition</TableCell>
                      <TableCell sx={{ minWidth: 180 }}>
                        Feedback / Reason
                      </TableCell>
                      <TableCell sx={{ minWidth: 130 }}>Reviewer</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {audits.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {item.createdAt
                              ? dateFormat.format(item.createdAt.toDate())
                              : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={
                              item.newStatus === 'approved'
                                ? 'Approved'
                                : 'Rejected'
                            }
                            sx={{
                              borderRadius: '3px',
                              fontWeight: 600,
                              fontSize: '0.6875rem',
                              ...(item.newStatus === 'approved'
                                ? {
                                    backgroundColor: '#F0FDF4',
                                    color: '#15803D',
                                    border: '1px solid #BBF7D0',
                                  }
                                : {
                                    backgroundColor: '#FEF2F2',
                                    color: '#B91C1C',
                                    border: '1px solid #FECACA',
                                  }),
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {item.previousStatus} → {item.newStatus}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.75rem',
                              color: '#1E293B',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {item.reason || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            sx={{
                              fontFamily: 'monospace',
                              color: '#64748B',
                              fontSize: '0.6875rem',
                            }}
                          >
                            {item.adminUid}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                disabled={auditsLoading || cursors.length === 0}
                onClick={() => setCursors((v) => v.slice(0, -1))}
              >
                Previous reviews
              </Button>
              <Button
                variant="outlined"
                size="small"
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
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          py: 1.5,
          px: 3,
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#FAFAFA',
          justifyContent: 'space-between',
        }}
      >
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
                size="small"
                sx={{
                  backgroundColor: '#167044',
                  '&:hover': { backgroundColor: '#115533' },
                }}
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
        <Button
          onClick={onClose}
          variant="outlined"
          size="small"
          sx={{ color: '#475569' }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

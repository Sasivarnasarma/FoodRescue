import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  onSnapshot,
  Timestamp,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useOnline } from '../hooks/use-online';
import { firebaseErrorMessage } from '../lib/error-message';
import { profilesQuery, profileReviewHistoryQuery } from '../lib/verification';
import ProfileDetails from './ProfileDetails';
import ReviewDialog, {
  type Decision,
  type PendingProfile,
} from './ReviewDialog';

type LiveList =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      rows: { id: string; data: DocumentData }[];
      cached: boolean;
    };

function useLiveList(createQuery: () => Query, attempt: number) {
  const [state, setState] = useState<{
    attempt: number;
    source: () => Query;
    list: LiveList;
  }>({
    attempt,
    source: createQuery,
    list: { status: 'loading' },
  });

  useEffect(() => {
    function onError(cause: unknown) {
      setState({
        attempt,
        source: createQuery,
        list: {
          status: 'error',
          message: firebaseErrorMessage(
            cause,
            'Could not load data. Try again.',
          ),
        },
      });
    }

    try {
      return onSnapshot(
        createQuery(),
        { includeMetadataChanges: true },
        (snapshot) => {
          setState({
            attempt,
            source: createQuery,
            list: {
              status: 'ready',
              rows: snapshot.docs.map((record) => ({
                id: record.id,
                data: record.data(),
              })),
              cached:
                snapshot.metadata.fromCache ||
                snapshot.metadata.hasPendingWrites,
            },
          });
        },
        onError,
      );
    } catch (cause) {
      onError(cause);
    }
  }, [createQuery, attempt]);

  return state.attempt === attempt && state.source === createQuery
    ? state.list
    : ({ status: 'loading' } as const);
}

function ListState({
  list,
  online,
  empty,
  onRetry,
  children,
}: {
  list: LiveList;
  online: boolean;
  empty: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (list.status === 'loading') {
    return (
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center' }}
        role="status"
      >
        <CircularProgress size={22} aria-label="Loading records" />
        <Typography color="text.secondary">Loading records…</Typography>
      </Stack>
    );
  }

  if (list.status === 'error') {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" disabled={!online} onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {list.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {online && list.cached && (
        <Alert severity="info">
          Waiting for current records from Firebase.
        </Alert>
      )}
      {list.rows.length > 0 ? (
        children
      ) : (
        <Typography color="text.secondary">
          {list.cached || !online ? 'No records are available offline.' : empty}
        </Typography>
      )}
    </Stack>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function ReviewConsole({ canReview }: { canReview: boolean }) {
  const online = useOnline();
  const [queueAttempt, setQueueAttempt] = useState(0);
  const [auditAttempt, setAuditAttempt] = useState(0);
  const [selected, setSelected] = useState<{
    profile: PendingProfile;
    decision: Decision;
  } | null>(null);
  const [notice, setNotice] = useState('');

  const [details, setDetails] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages[pages.length - 1];
  const directoryQuery = useCallback(() => profilesQuery(cursor), [cursor]);
  const queue = useLiveList(directoryQuery, queueAttempt);
  const audit = useLiveList(profileReviewHistoryQuery, auditAttempt);
  const queueCurrent = queue.status === 'ready' && !queue.cached && online;
  const reviewEnabled = queueCurrent && canReview;
  const selectedPending =
    queue.status === 'ready' &&
    queue.rows.some(({ id }) => id === selected?.profile.uid);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
          Profile verification
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Review donor and recipient profiles before they can take part in
          donations.
        </Typography>
      </Box>
      {!online && (
        <Alert severity="warning">
          You are offline. Displayed records may be out of date. Reconnect to
          review a profile.
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <Paper
        component="section"
        aria-labelledby="pending-heading"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 } }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography id="pending-heading" component="h2" variant="h6">
              All profiles
            </Typography>
            {queueCurrent && (
              <Chip
                size="small"
                label={
                  queue.rows.length === 50 ? 'Showing 50' : queue.rows.length
                }
              />
            )}
          </Stack>
          <ListState
            list={queue}
            online={online}
            empty="No profiles found."
            onRetry={() => setQueueAttempt((value) => value + 1)}
          >
            {queue.status === 'ready' &&
              queue.rows.map(({ id, data }) => {
                const isApproved = data.verificationStatus === 'approved';
                const isRejected = data.verificationStatus === 'rejected';
                const profile: PendingProfile = {
                  uid: id,
                  name:
                    typeof data.name === 'string'
                      ? data.name
                      : 'Unnamed profile',
                  role:
                    data.type === 'provider'
                      ? 'Donor business'
                      : 'Recipient organization',
                  currentStatus: String(data.verificationStatus ?? 'pending'),
                  previousReason:
                    typeof data.rejectionReason === 'string'
                      ? data.rejectionReason
                      : '',
                };

                return (
                  <Stack
                    key={id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    sx={{
                      alignItems: { sm: 'center' },
                      justifyContent: 'space-between',
                      p: 2,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <Typography sx={{ fontWeight: 700 }}>
                        {profile.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {profile.role}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {id}
                      </Typography>
                      {isRejected && profile.previousReason && (
                        <Typography
                          variant="body2"
                          color="error.main"
                          sx={{ fontStyle: 'italic', mt: 0.5 }}
                        >
                          Rejection feedback: {profile.previousReason}
                        </Typography>
                      )}
                    </Box>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
                    >
                      <Button onClick={() => setDetails(id)}>
                        View details
                      </Button>
                      <Chip
                        label={
                          isApproved
                            ? 'Approved'
                            : isRejected
                              ? 'Rejected'
                              : 'Pending'
                        }
                        size="small"
                        color={
                          isApproved
                            ? 'success'
                            : isRejected
                              ? 'error'
                              : 'warning'
                        }
                      />
                      <Button
                        variant="outlined"
                        color="error"
                        aria-label={`Reject ${profile.name}`}
                        disabled={!reviewEnabled}
                        onClick={() => {
                          setNotice('');
                          setSelected({ profile, decision: 'rejected' });
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="contained"
                        aria-label={`Approve ${profile.name}`}
                        disabled={!reviewEnabled}
                        onClick={() => {
                          setNotice('');
                          setSelected({ profile, decision: 'approved' });
                        }}
                      >
                        Approve
                      </Button>
                    </Stack>
                  </Stack>
                );
              })}
          </ListState>
          <Stack direction="row" spacing={1}>
            <Button
              disabled={!pages.length}
              onClick={() => setPages(pages.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              disabled={queue.status !== 'ready' || queue.rows.length < 50}
              onClick={() => {
                if (queue.status === 'ready')
                  setPages([...pages, queue.rows[queue.rows.length - 1].id]);
              }}
            >
              Next
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Paper
        component="section"
        aria-labelledby="audit-heading"
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 } }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography id="audit-heading" component="h2" variant="h6">
              Review history
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Up to 50 recent decisions, newest first.
            </Typography>
          </Box>
          <ListState
            list={audit}
            online={online}
            empty="No reviews have been recorded."
            onRetry={() => setAuditAttempt((value) => value + 1)}
          >
            {audit.status === 'ready' &&
              audit.rows.map(({ id, data }) => (
                <Stack
                  key={id}
                  spacing={0.75}
                  sx={{
                    p: 2,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflowWrap: 'anywhere',
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: { sm: 'center' },
                    }}
                  >
                    <Chip
                      sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
                      size="small"
                      color={
                        data.newStatus === 'approved' ? 'success' : 'error'
                      }
                      label={
                        data.newStatus === 'approved' ? 'Approved' : 'Rejected'
                      }
                    />
                    {data.createdAt instanceof Timestamp && (
                      <Typography variant="body2" color="text.secondary">
                        {dateFormat.format(data.createdAt.toDate())}
                      </Typography>
                    )}
                  </Stack>
                  <Typography>{data.reason}</Typography>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    sx={{
                      alignItems: { sm: 'center' },
                      justifyContent: 'space-between',
                      mt: 0.5,
                    }}
                  >
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        Profile UID {data.targetUid}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Reviewed by {data.adminUid}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setDetails(data.targetUid)}
                    >
                      View profile & audit trail
                    </Button>
                  </Stack>
                </Stack>
              ))}
          </ListState>
        </Stack>
      </Paper>
      {details && (
        <ProfileDetails
          uid={details}
          canReview={reviewEnabled}
          onClose={() => setDetails(null)}
          onReview={(profile, decision) => {
            setDetails(null);
            setNotice('');
            setSelected({ profile, decision });
          }}
        />
      )}
      {selected && (
        <ReviewDialog
          profile={selected.profile}
          decision={selected.decision}
          available={reviewEnabled && selectedPending}
          onClose={() => setSelected(null)}
          onDone={() => {
            setNotice(`${selected.profile.name} was ${selected.decision}.`);
            setSelected(null);
          }}
        />
      )}
    </Stack>
  );
}

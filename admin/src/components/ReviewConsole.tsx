import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  onSnapshot,
  Timestamp,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
      <Box sx={{ p: 5, display: 'flex', justifyContent: 'center' }}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center' }}
          role="status"
        >
          <CircularProgress
            size={18}
            color="primary"
            aria-label="Loading records"
          />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 500 }}
          >
            Loading records…
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (list.status === 'error') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={!online}
              onClick={onRetry}
            >
              Retry
            </Button>
          }
        >
          {list.message}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {online && list.cached && (
        <Box sx={{ p: 2 }}>
          <Alert severity="info">
            Waiting for current records from Firebase server.
          </Alert>
        </Box>
      )}
      {list.rows.length > 0 ? (
        children
      ) : (
        <Box sx={{ p: 5, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {list.cached || !online
              ? 'No records are available offline.'
              : empty}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function StatusBadge({ status }: { status: string }) {
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.35,
        borderRadius: '4px',
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        ...(isApproved
          ? {
              backgroundColor: '#F0FDF4',
              color: '#15803D',
              border: '1px solid #BBF7D0',
            }
          : isRejected
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
    >
      <Box
        sx={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: isApproved
            ? '#16A34A'
            : isRejected
              ? '#DC2626'
              : '#D97706',
        }}
      />
      <span>
        {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending'}
      </span>
    </Box>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  tone = 'default',
}: {
  title: string;
  value: number | string;
  subtitle: string;
  tone?: 'default' | 'success' | 'warning' | 'info';
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.25,
        borderRadius: '6px',
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)',
      }}
    >
      <Stack spacing={0.5}>
        <Typography
          variant="caption"
          sx={{
            color: '#64748B',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontSize: '0.6875rem',
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            color:
              tone === 'success'
                ? '#15803D'
                : tone === 'warning'
                  ? '#B45309'
                  : '#0F172A',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: '#94A3B8', fontSize: '0.75rem' }}
        >
          {subtitle}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default function ReviewConsole({ canReview }: { canReview: boolean }) {
  const online = useOnline();
  const [queueAttempt, setQueueAttempt] = useState(0);
  const [auditAttempt, setAuditAttempt] = useState(0);
  const [selected, setSelected] = useState<{
    profile: PendingProfile;
    decision: Decision;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected'
  >('all');

  const [details, setDetails] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages[pages.length - 1];
  const directoryQuery = useCallback(() => profilesQuery(cursor), [cursor]);
  const queue = useLiveList(directoryQuery, queueAttempt);
  const audit = useLiveList(profileReviewHistoryQuery, auditAttempt);
  const queueCurrent = queue.status === 'ready' && !queue.cached && online;
  const reviewEnabled = queueCurrent && canReview;

  // Filtered rows for fast client search
  const filteredRows = useMemo(() => {
    if (queue.status !== 'ready') return [];
    return queue.rows.filter(({ id, data }) => {
      const name = String(data.name ?? '').toLowerCase();
      const status = String(data.verificationStatus ?? 'pending').toLowerCase();
      const matchesSearch =
        !search.trim() ||
        name.includes(search.toLowerCase()) ||
        id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [queue, search, statusFilter]);

  // Quick stats
  const stats = useMemo(() => {
    if (queue.status !== 'ready') {
      return { total: 0, pending: 0, approved: 0, rejected: 0 };
    }
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of queue.rows) {
      const st = r.data.verificationStatus;
      if (st === 'approved') approved++;
      else if (st === 'rejected') rejected++;
      else pending++;
    }
    return {
      total: queue.rows.length,
      pending,
      approved,
      rejected,
    };
  }, [queue]);

  return (
    <Stack spacing={3.5}>
      {/* Page Header */}
      <Box>
        <Typography
          component="h1"
          variant="h5"
          sx={{ fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}
        >
          Organization Verification Directory
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage donor business and recipient organization credentials, review
          applications, and track administrative decisions.
        </Typography>
      </Box>

      {/* KPI Stats Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}
      >
        <StatCard
          title="Profiles on This Page"
          value={queue.status === 'ready' ? stats.total : '—'}
          subtitle="Current directory page, up to 50 profiles"
        />
        <StatCard
          title="Pending on This Page"
          value={queue.status === 'ready' ? stats.pending : '—'}
          subtitle="Awaiting review on this page"
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Approved on This Page"
          value={queue.status === 'ready' ? stats.approved : '—'}
          subtitle="Verified profiles on this page"
          tone="success"
        />
        <StatCard
          title="Recent Audit Decisions"
          value={audit.status === 'ready' ? audit.rows.length : '—'}
          subtitle="Up to 50 latest logged reviews"
        />
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

      {/* Organization Verification Table Paper */}
      <Paper
        component="section"
        aria-labelledby="pending-heading"
        variant="outlined"
        sx={{
          borderRadius: '6px',
          borderColor: '#E2E8F0',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Table Toolbar & Filters */}
        <Box
          sx={{
            p: 2,
            px: 2.5,
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#FAFAFA',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { md: 'center' },
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          {/* Status Tabs */}
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: 'All Organizations', count: stats.total },
                { id: 'pending', label: 'Pending', count: stats.pending },
                { id: 'approved', label: 'Approved', count: stats.approved },
                { id: 'rejected', label: 'Rejected', count: stats.rejected },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <Button
                  key={tab.id}
                  size="small"
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => setStatusFilter(tab.id)}
                  sx={{
                    fontSize: '0.75rem',
                    py: 0.4,
                    px: 1.25,
                    borderRadius: '4px',
                    ...(active
                      ? {
                          backgroundColor: '#167044',
                          color: '#FFFFFF',
                          borderColor: '#167044',
                          '&:hover': { backgroundColor: '#115533' },
                        }
                      : {
                          borderColor: '#CBD5E1',
                          color: '#475569',
                          backgroundColor: '#FFFFFF',
                          '&:hover': { backgroundColor: '#F1F5F9' },
                        }),
                  }}
                >
                  {tab.label}
                  {queue.status === 'ready' && (
                    <Box
                      component="span"
                      sx={{
                        ml: 0.75,
                        px: 0.6,
                        py: 0.1,
                        borderRadius: '3px',
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        backgroundColor: active
                          ? 'rgba(255, 255, 255, 0.25)'
                          : '#F1F5F9',
                        color: active ? '#FFFFFF' : '#64748B',
                      }}
                    >
                      {tab.count}
                    </Box>
                  )}
                </Button>
              );
            })}
          </Stack>

          {/* Search Box */}
          <TextField
            size="small"
            placeholder="Search this page by name or UID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              minWidth: { xs: '100%', md: 260 },
              '& .MuiOutlinedInput-root': {
                height: 34,
                fontSize: '0.8125rem',
                backgroundColor: '#FFFFFF',
              },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.875rem' }}>
                      🔍
                    </Typography>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        <Typography variant="caption" sx={{ display: 'block', px: 2.5, py: 1 }}>
          Search, status filters and profile counts apply to this page. Use Next
          to browse more profiles.
        </Typography>
        <ListState
          list={queue}
          online={online}
          empty="No organization profiles found."
          onRetry={() => setQueueAttempt((value) => value + 1)}
        >
          {queue.status === 'ready' && (
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 240 }}>Organization</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Type / Role</TableCell>
                    <TableCell sx={{ minWidth: 170 }}>Account UID</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>Status</TableCell>
                    <TableCell align="right" sx={{ minWidth: 200 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        sx={{ textAlign: 'center', py: 3 }}
                      >
                        No profiles match on this page. Clear the filters or
                        browse another page.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredRows.map(({ id, data }) => {
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
                      currentStatus: String(
                        data.verificationStatus ?? 'pending',
                      ),
                      previousReason:
                        typeof data.rejectionReason === 'string'
                          ? data.rejectionReason
                          : '',
                    };

                    const isRejected = data.verificationStatus === 'rejected';
                    const isDonor = data.type === 'provider';

                    return (
                      <TableRow key={id} hover>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1.25}
                            sx={{ alignItems: 'center' }}
                          >
                            <Box
                              sx={{
                                width: 28,
                                height: 28,
                                borderRadius: '4px',
                                backgroundColor: isDonor
                                  ? '#E1F3E8'
                                  : '#EFF6FF',
                                border: '1px solid',
                                borderColor: isDonor ? '#BBF7D0' : '#BFDBFE',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.875rem',
                              }}
                            >
                              {isDonor ? '🏪' : '🤝'}
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: '#0F172A' }}
                              >
                                {profile.name}
                              </Typography>
                              {isRejected && profile.previousReason && (
                                <Typography
                                  variant="caption"
                                  color="error.main"
                                  sx={{
                                    display: 'block',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  Reason: {profile.previousReason}
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {profile.role}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            sx={{
                              fontFamily: 'monospace',
                              color: '#64748B',
                              backgroundColor: '#F1F5F9',
                              px: 0.75,
                              py: 0.25,
                              borderRadius: '3px',
                              border: '1px solid #E2E8F0',
                            }}
                          >
                            {id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={profile.currentStatus ?? 'pending'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Stack
                            direction="row"
                            spacing={0.75}
                            sx={{
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                            }}
                          >
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setDetails(id)}
                              sx={{
                                fontSize: '0.75rem',
                                py: 0.2,
                                px: 1,
                                borderColor: '#CBD5E1',
                                color: '#475569',
                              }}
                            >
                              Details
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              aria-label={`Reject ${profile.name}`}
                              disabled={!reviewEnabled}
                              sx={{
                                fontSize: '0.75rem',
                                py: 0.2,
                                px: 1,
                                borderColor: '#FECACA',
                                color: '#DC2626',
                                backgroundColor: '#FFFFFF',
                                '&:hover': {
                                  borderColor: '#EF4444',
                                  backgroundColor: '#FEF2F2',
                                },
                              }}
                              onClick={() => {
                                setNotice('');
                                setSelected({ profile, decision: 'rejected' });
                              }}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="contained"
                              size="small"
                              aria-label={`Approve ${profile.name}`}
                              disabled={!reviewEnabled}
                              sx={{
                                fontSize: '0.75rem',
                                py: 0.2,
                                px: 1.25,
                                backgroundColor: '#167044',
                                '&:hover': { backgroundColor: '#115533' },
                              }}
                              onClick={() => {
                                setNotice('');
                                setSelected({ profile, decision: 'approved' });
                              }}
                            >
                              Approve
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </ListState>

        {/* Pagination Bar */}
        <Box
          sx={{
            p: 1.5,
            px: 2.5,
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Page {pages.length + 1} • {filteredRows.length} displayed
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              disabled={!pages.length}
              onClick={() => setPages(pages.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={queue.status !== 'ready' || queue.rows.length < 50}
              onClick={() => {
                if (queue.status === 'ready')
                  setPages([...pages, queue.rows[queue.rows.length - 1].id]);
              }}
            >
              Next
            </Button>
          </Stack>
        </Box>
      </Paper>

      {/* Review History / Audit Trail Table */}
      <Paper
        component="section"
        aria-labelledby="audit-heading"
        variant="outlined"
        sx={{
          borderRadius: '6px',
          borderColor: '#E2E8F0',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Box
          sx={{
            p: 2,
            px: 2.5,
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#FAFAFA',
          }}
        >
          <Typography
            id="audit-heading"
            component="h2"
            variant="subtitle2"
            sx={{ fontWeight: 700, color: '#0F172A' }}
          >
            Review History & Administrative Audit Log
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Latest 50 verification actions recorded in Firestore audit ledger.
          </Typography>
        </Box>

        <ListState
          list={audit}
          online={online}
          empty="No administrative reviews recorded."
          onRetry={() => setAuditAttempt((value) => value + 1)}
        >
          {audit.status === 'ready' && (
            <TableContainer sx={{ maxHeight: 450 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 160 }}>Timestamp</TableCell>
                    <TableCell sx={{ minWidth: 110 }}>Decision</TableCell>
                    <TableCell sx={{ minWidth: 260 }}>
                      Feedback / Reason
                    </TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Target UID</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Reviewer</TableCell>
                    <TableCell align="right" sx={{ minWidth: 110 }}>
                      Action
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {audit.rows.map(({ id, data }) => (
                    <TableRow key={id} hover>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {data.createdAt instanceof Timestamp
                            ? dateFormat.format(data.createdAt.toDate())
                            : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={
                            data.newStatus === 'approved'
                              ? 'approved'
                              : 'rejected'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            color: '#1E293B',
                            fontWeight: 500,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {data.reason || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: 'monospace',
                            color: '#64748B',
                          }}
                        >
                          {data.targetUid}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: 'monospace',
                            color: '#64748B',
                          }}
                        >
                          {data.adminUid}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setDetails(data.targetUid)}
                          sx={{
                            fontSize: '0.75rem',
                            color: '#167044',
                            fontWeight: 600,
                          }}
                        >
                          Inspect →
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </ListState>
      </Paper>

      {details && (
        <ProfileDetails
          key={details}
          uid={details}
          canReview={canReview && online}
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
          key={`${selected.profile.uid}:${selected.decision}`}
          profile={selected.profile}
          decision={selected.decision}
          available={canReview && online}
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

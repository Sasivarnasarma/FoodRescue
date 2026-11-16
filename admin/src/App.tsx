import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { User } from 'firebase/auth';
import { type FormEvent, useEffect, useState } from 'react';
import ReviewConsole from './components/ReviewConsole';
import {
  signInAdmin,
  signOutAdmin,
  watchAdminSession,
  type AdminSession,
} from './lib/auth';
import { firebaseErrorMessage } from './lib/error-message';
import { hasFirebaseConfig } from './lib/firebase';
import { useOnline } from './hooks/use-online';

function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      sx={{
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </Box>
  );
}

function EmailIcon() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      sx={{
        width: 18,
        height: 18,
        fill: 'none',
        stroke: '#94A3B8',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </Box>
  );
}

function LockIcon() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      sx={{
        width: 18,
        height: 18,
        fill: 'none',
        stroke: '#94A3B8',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Box>
  );
}

function SignIn({
  session,
  onRetry,
}: {
  session: AdminSession | null;
  onRetry: () => void;
}) {
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !online) return;
    setBusy(true);
    setError('');
    try {
      await signInAdmin(email, password);
    } catch (cause) {
      setError(
        firebaseErrorMessage(
          cause,
          'Sign-in failed. Check your details and try again.',
        ),
      );
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError('');
    try {
      await signOutAdmin();
    } catch (cause) {
      setError(firebaseErrorMessage(cause, 'Could not sign out. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: '8px',
        borderColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        boxShadow:
          '0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top emerald accent line */}
      <Box
        sx={{
          height: 4,
          background: 'linear-gradient(90deg, #167044 0%, #22C55E 100%)',
        }}
      />

      <Box sx={{ p: { xs: 3.5, sm: 4.5 } }}>
        <Stack spacing={3.5}>
          {/* Brand & Title Header */}
          <Box>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'center', mb: 1.5 }}
            >
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: '6px',
                  backgroundColor: '#167044',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(22, 112, 68, 0.3)',
                }}
              >
                <ShieldIcon size={20} />
              </Box>
              <Box>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <Typography
                    component="h1"
                    variant="h6"
                    sx={{
                      fontWeight: 800,
                      color: '#0F172A',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.2,
                    }}
                  >
                    FoodRescue
                  </Typography>
                  <Box
                    sx={{
                      px: 0.75,
                      py: 0.2,
                      borderRadius: '3px',
                      backgroundColor: '#DCFCE7',
                      border: '1px solid #BBF7D0',
                      color: '#15803D',
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                    }}
                  >
                    ADMIN
                  </Box>
                </Stack>
                <Typography
                  variant="caption"
                  sx={{ color: '#64748B', fontWeight: 500 }}
                >
                  Verification & Operations Console
                </Typography>
              </Box>
            </Stack>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1.5, mt: 1 }}
            >
              Sign in with your administrator credentials to review organization
              registrations and manage platform access.
            </Typography>
          </Box>

          {!hasFirebaseConfig ? (
            <Alert severity="error">
              Firebase is not configured. Add the Web SDK values to the
              repository root .env file and restart the admin app.
            </Alert>
          ) : !session ? (
            <Box
              sx={{
                p: 3,
                backgroundColor: '#F8FAFC',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
              }}
              role="status"
            >
              <CircularProgress size={18} color="primary" />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 500 }}
              >
                Checking administrative session…
              </Typography>
            </Box>
          ) : (
            <>
              {!online && (
                <Alert severity="warning">
                  You are offline. Reconnect to sign in.
                </Alert>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              {session.status === 'denied' && (
                <Alert severity="error">
                  This account does not have administrator access.
                </Alert>
              )}
              {session.status === 'error' && (
                <>
                  <Alert severity="error">{session.message}</Alert>
                  <Button
                    onClick={onRetry}
                    disabled={!online || busy}
                    variant="outlined"
                  >
                    Check session again
                  </Button>
                </>
              )}
              {session.status === 'denied' || session.status === 'error' ? (
                <Button
                  variant="outlined"
                  onClick={() => void handleSignOut()}
                  disabled={busy}
                >
                  Sign out
                </Button>
              ) : (
                <Stack
                  component="form"
                  spacing={2.25}
                  onSubmit={(event) => void handleSignIn(event)}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: '#334155',
                        mb: 0.75,
                        display: 'block',
                      }}
                    >
                      Email address
                    </Typography>
                    <TextField
                      name="email"
                      type="email"
                      size="small"
                      fullWidth
                      placeholder="admin@foodrescue.org"
                      autoComplete="username"
                      value={email}
                      required
                      disabled={busy}
                      onChange={(event) => setEmail(event.target.value)}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <EmailIcon />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  </Box>

                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: '#334155',
                        mb: 0.75,
                        display: 'block',
                      }}
                    >
                      Password
                    </Typography>
                    <TextField
                      name="password"
                      type="password"
                      size="small"
                      fullWidth
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      value={password}
                      required
                      disabled={busy}
                      onChange={(event) => setPassword(event.target.value)}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockIcon />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  </Box>

                  <Button
                    type="submit"
                    variant="contained"
                    size="medium"
                    loading={busy}
                    disabled={!online}
                    sx={{
                      mt: 1,
                      py: 1.2,
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      background:
                        'linear-gradient(180deg, #167044 0%, #115533 100%)',
                      boxShadow: '0 2px 4px rgba(22, 112, 68, 0.25)',
                      '&:hover': {
                        background:
                          'linear-gradient(180deg, #135e39 0%, #0d4428 100%)',
                      },
                    }}
                  >
                    Sign in to console →
                  </Button>
                </Stack>
              )}
            </>
          )}

          {/* Security footnote */}
          <Box
            sx={{
              pt: 2.5,
              borderTop: '1px solid #F1F5F9',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: '#94A3B8', fontSize: '0.6875rem', fontWeight: 500 }}
            >
              🔒 University Project • Restricted Administrative Environment
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
}

function AdminView({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSignOut() {
    setBusy(true);
    setError('');
    try {
      await signOutAdmin();
    } catch (cause) {
      setError(firebaseErrorMessage(cause, 'Could not sign out. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const userInitial = user.email ? user.email.charAt(0).toUpperCase() : 'A';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F8FAFC',
      }}
    >
      <Box
        component="header"
        sx={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Container maxWidth="xl">
          <Stack
            direction="row"
            spacing={2}
            sx={{
              height: 60,
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Stack direction="row" spacing={2.5} sx={{ alignItems: 'center' }}>
              <Stack
                direction="row"
                spacing={1.25}
                sx={{ alignItems: 'center' }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '5px',
                    backgroundColor: '#167044',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShieldIcon size={18} />
                </Box>
                <Typography
                  variant="subtitle1"
                  color="text.primary"
                  sx={{
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    fontSize: '1.05rem',
                  }}
                >
                  FoodRescue
                </Typography>
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: '3px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                  }}
                >
                  CONSOLE
                </Box>
              </Stack>

              <Box
                sx={{
                  display: { xs: 'none', md: 'block' },
                  width: 1,
                  height: 20,
                  backgroundColor: '#E2E8F0',
                }}
              />

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  display: { xs: 'none', md: 'block' },
                  fontWeight: 500,
                  fontSize: '0.8125rem',
                }}
              >
                Verification & Organization Directory
              </Typography>
            </Stack>

            <Stack
              direction="row"
              spacing={1.5}
              sx={{ minWidth: 0, alignItems: 'center' }}
            >
              <Box
                sx={{
                  display: { xs: 'none', sm: 'flex' },
                  alignItems: 'center',
                  gap: 1,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: '4px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: '#167044',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                  }}
                >
                  {userInitial}
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    fontSize: '0.75rem',
                    color: '#334155',
                    fontFamily: 'monospace',
                  }}
                >
                  {user.email}
                </Typography>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#16A34A',
                  }}
                />
              </Box>

              <Button
                variant="outlined"
                size="small"
                onClick={() => void handleSignOut()}
                loading={busy}
                sx={{
                  flexShrink: 0,
                  fontSize: '0.75rem',
                  borderColor: '#CBD5E1',
                  color: '#475569',
                  '&:hover': {
                    borderColor: '#94A3B8',
                    backgroundColor: '#F1F5F9',
                  },
                }}
              >
                Sign out
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container
        component="main"
        maxWidth="xl"
        sx={{ py: { xs: 3, sm: 4 }, flex: 1 }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 2.5 }}>
            {error}
          </Alert>
        )}
        <ReviewConsole canReview={!busy} />
      </Container>
    </Box>
  );
}

export default function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hasFirebaseConfig) return watchAdminSession(setSession);
  }, [attempt]);

  if (session?.status === 'admin')
    return <AdminView key={session.user.uid} user={session.user} />;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(ellipse at 50% -10%, rgba(22, 112, 68, 0.12) 0%, #F8FAFC 70%)',
        p: 2.5,
      }}
    >
      <Container component="main" maxWidth="xs" sx={{ p: 0 }}>
        <SignIn
          session={session}
          onRetry={() => {
            setSession(null);
            setAttempt((value) => value + 1);
          }}
        />
      </Container>
    </Box>
  );
}

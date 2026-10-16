import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
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
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography
            component="h1"
            variant="h4"
            sx={{ fontWeight: 700 }}
            color="primary.main"
          >
            FoodRescue Admin
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Sign in to review donor and organization profiles.
          </Typography>
        </Box>
        {!hasFirebaseConfig ? (
          <Alert severity="error">
            Firebase is not configured. Add the Web SDK values to the repository
            root .env file and restart the admin app.
          </Alert>
        ) : !session ? (
          <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: 'center' }}
            role="status"
          >
            <CircularProgress size={24} aria-label="Checking your session" />
            <Typography>Checking your session…</Typography>
          </Stack>
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
                <Button onClick={onRetry} disabled={!online || busy}>
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
                spacing={2}
                onSubmit={(event) => void handleSignIn(event)}
              >
                <TextField
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  required
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <TextField
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  required
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  loading={busy}
                  disabled={!online}
                >
                  Sign in
                </Button>
              </Stack>
            )}
          </>
        )}
      </Stack>
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

  return (
    <>
      <Box
        component="header"
        sx={{
          backgroundColor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction="row"
            spacing={2}
            sx={{
              py: 2,
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography
              variant="h6"
              color="primary.main"
              sx={{ fontWeight: 700 }}
            >
              FoodRescue Admin
            </Typography>
            <Stack
              direction="row"
              spacing={2}
              sx={{ minWidth: 0, alignItems: 'center' }}
            >
              <Typography
                color="text.secondary"
                variant="body2"
                noWrap
                sx={{ display: { xs: 'none', sm: 'block' } }}
              >
                {user.email}
              </Typography>
              <Button
                variant="outlined"
                onClick={() => void handleSignOut()}
                loading={busy}
                sx={{ flexShrink: 0 }}
              >
                Sign out
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <ReviewConsole canReview={!busy} />
      </Container>
    </>
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
    <Container component="main" maxWidth="sm" sx={{ py: { xs: 6, sm: 10 } }}>
      <SignIn
        session={session}
        onRetry={() => {
          setSession(null);
          setAttempt((value) => value + 1);
        }}
      />
    </Container>
  );
}

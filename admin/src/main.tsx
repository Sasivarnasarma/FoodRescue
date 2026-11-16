import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const theme = createTheme({
  palette: {
    primary: {
      main: '#167044',
      light: '#e1f3e8',
      dark: '#115533',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#334155',
      light: '#64748B',
      dark: '#1E293B',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F8FAFC',
      paper: '#ffffff',
    },
    text: {
      primary: '#0F172A',
      secondary: '#475569',
    },
    divider: '#E2E8F0',
    success: {
      main: '#15803D',
      light: '#DCFCE7',
      dark: '#166534',
    },
    warning: {
      main: '#B45309',
      light: '#FEF3C7',
      dark: '#92400E',
    },
    error: {
      main: '#DC2626',
      light: '#FEF2F2',
      dark: '#991B1B',
    },
    info: {
      main: '#0284C7',
      light: '#F0F9FF',
      dark: '#0369A1',
    },
  },
  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.025em' },
    h4: { fontWeight: 700, letterSpacing: '-0.02em', color: '#0F172A' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em', color: '#0F172A' },
    subtitle1: { fontSize: '0.9375rem', fontWeight: 500 },
    subtitle2: {
      fontSize: '0.8125rem',
      fontWeight: 600,
      letterSpacing: '0.02em',
    },
    body1: { fontSize: '0.875rem', lineHeight: 1.5, color: '#334155' },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5, color: '#475569' },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem' },
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 4,
          boxShadow: 'none',
          padding: '6px 14px',
          fontWeight: 600,
          fontSize: '0.8125rem',
          transition: 'all 0.12s ease-in-out',
        },
        contained: {
          '&:hover': {
            boxShadow: 'none',
            backgroundColor: '#115533',
          },
        },
        outlined: {
          borderColor: '#CBD5E1',
          color: '#334155',
          backgroundColor: '#FFFFFF',
          '&:hover': {
            borderColor: '#94A3B8',
            backgroundColor: '#F8FAFC',
          },
        },
        sizeSmall: {
          padding: '4px 10px',
          fontSize: '0.75rem',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
        outlined: {
          borderColor: '#E2E8F0',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: '#ffffff',
          fontSize: '0.875rem',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#CBD5E1',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#94A3B8',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#167044',
            borderWidth: 1.5,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontWeight: 600,
          fontSize: '0.6875rem',
          height: 22,
          padding: '0 2px',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          border: '1px solid',
          fontSize: '0.8125rem',
          padding: '8px 14px',
          '&.MuiAlert-colorSuccess': {
            backgroundColor: '#F0FDF4',
            borderColor: '#BBF7D0',
            color: '#15803D',
          },
          '&.MuiAlert-colorError': {
            backgroundColor: '#FEF2F2',
            borderColor: '#FECACA',
            color: '#B91C1C',
          },
          '&.MuiAlert-colorWarning': {
            backgroundColor: '#FFFBEB',
            borderColor: '#FDE68A',
            color: '#B45309',
          },
          '&.MuiAlert-colorInfo': {
            backgroundColor: '#F0F9FF',
            borderColor: '#BAE6FD',
            color: '#0369A1',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 6,
          border: '1px solid #E2E8F0',
          boxShadow:
            '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#E2E8F0',
          padding: '10px 14px',
          fontSize: '0.8125rem',
        },
        head: {
          backgroundColor: '#F8FAFC',
          fontWeight: 600,
          fontSize: '0.6875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#475569',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#F8FAFC',
          },
        },
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);

if (import.meta.env.PROD) {
  void import('./lib/firebase')
    .then(({ startFirebaseAnalytics }) => startFirebaseAnalytics())
    .catch(() => {
      console.warn('Firebase Analytics could not start.');
    });
}

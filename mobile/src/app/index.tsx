import type { User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AccountButton,
  AccountError,
  accountErrorMessage,
} from '@/components/donor-controls';
import { AccountProfile } from '@/components/account-profile';
import { DonorSignIn } from '@/components/donor-sign-in';
import { watchSession } from '@/lib/auth';
import { hasFirebaseConfig } from '@/lib/firebase';

export default function HomeScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasFirebaseConfig) return;
    try {
      return watchSession(setUser);
    } catch (error) {
      let active = true;
      queueMicrotask(() => {
        if (active) {
          setSessionError(
            accountErrorMessage(error, 'Unable to restore your session.'),
          );
        }
      });
      return () => {
        active = false;
      };
    }
  }, [attempt]);

  if (user) {
    return (
      <SafeAreaView style={styles.appShell}>
        <AccountProfile key={user.uid} user={user} />
      </SafeAreaView>
    );
  }

  if (user === undefined && hasFirebaseConfig && !sessionError) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoIcon}>🌱</Text>
        </View>
        <ActivityIndicator
          size="large"
          color="#167044"
          style={{ marginTop: 20 }}
        />
        <Text style={styles.loadingText}>Restoring your session…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.page}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authContainer}>
            {/* Hero Header */}
            <View style={styles.header}>
              <View style={styles.logoBadge}>
                <Text style={styles.logoIcon}>🌱</Text>
              </View>
              <View style={styles.headerTexts}>
                <View style={styles.ecoPill}>
                  <Text style={styles.ecoPillText}>
                    Verified Food Sharing Platform
                  </Text>
                </View>
                <Text accessibilityRole="header" style={styles.brand}>
                  FoodRescue
                </Text>
                <Text style={styles.tagline}>
                  Rescue surplus food. Nourish nearby communities.
                </Text>
              </View>
            </View>

            {/* Auth Card */}
            <View style={styles.authCard}>
              {!hasFirebaseConfig ? (
                <AccountError message="Firebase is not configured. Add the client settings to the repository's .env file and restart the app." />
              ) : sessionError ? (
                <View style={styles.retry}>
                  <AccountError message={sessionError} />
                  <AccountButton
                    label="Retry connection"
                    onPress={() => {
                      setSessionError('');
                      setAttempt((value) => value + 1);
                    }}
                  />
                </View>
              ) : (
                <DonorSignIn />
              )}
            </View>

            {/* Platform Feature Cards */}
            <View style={styles.featureGrid}>
              <View style={styles.featureCard}>
                <Text style={styles.featureIcon}>🏪</Text>
                <View style={{ flex: 1, flexShrink: 1, gap: 2 }}>
                  <Text style={styles.featureTitle}>For Food Businesses</Text>
                  <Text style={styles.featureDesc}>
                    Post usable surplus in 60s. Hand over directly to verified
                    non-profits.
                  </Text>
                </View>
              </View>

              <View style={styles.featureCard}>
                <Text style={styles.featureIcon}>🤝</Text>
                <View style={{ flex: 1, flexShrink: 1, gap: 2 }}>
                  <Text style={styles.featureTitle}>For Non-Profits</Text>
                  <Text style={styles.featureDesc}>
                    Browse free local surplus, claim entire listings, and
                    coordinate pickup.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  page: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 24 : 16,
    paddingBottom: 40,
  },
  authContainer: {
    width: '100%',
    maxWidth: 340,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 4,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  logoIcon: {
    fontSize: 30,
  },
  headerTexts: {
    alignItems: 'center',
    gap: 6,
  },
  ecoPill: {
    backgroundColor: '#E1F3E8',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  ecoPillText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  brand: {
    color: '#0F172A',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  tagline: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 320,
  },
  authCard: {
    backgroundColor: '#ffffff',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  retry: { gap: 12 },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  featureGrid: {
    gap: 12,
  },
  featureCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    fontSize: 24,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  featureDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
});

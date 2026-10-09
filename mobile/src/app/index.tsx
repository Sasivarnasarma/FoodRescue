import { Link, useSitemap, type Href } from 'expo-router';
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
  donorColors,
} from '@/components/donor-controls';
import { DonorProfile } from '@/components/donor-profile';
import { DonorSignIn } from '@/components/donor-sign-in';
import { watchSession } from '@/lib/auth';
import { hasFirebaseConfig } from '@/lib/firebase';

export default function HomeScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const sitemap = useSitemap();
  const organization = sitemap?.children.find(
    (screen) => screen.href === '/organization',
  );
  const devicePermissions = sitemap?.children.find(
    (screen) => screen.href === '/device-permissions',
  );

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

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.page}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.intro}>
              <Text accessibilityRole="header" style={styles.brand}>
                FoodRescue
              </Text>
              <Text style={styles.description}>
                Give surplus food to verified organizations near you.
              </Text>
            </View>
            <View style={styles.card}>
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
              ) : user === undefined ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={donorColors.green} />
                  <Text
                    accessibilityLiveRegion="polite"
                    style={styles.description}
                  >
                    Checking your sign-in…
                  </Text>
                </View>
              ) : user ? (
                <DonorProfile key={user.uid} user={user} />
              ) : (
                <DonorSignIn />
              )}
            </View>
            {!!organization && (
              <Link href={organization.href as Href} style={styles.link}>
                Recipient organization
              </Link>
            )}
            {!!devicePermissions && (
              <Link href={devicePermissions.href as Href} style={styles.link}>
                Device permissions
              </Link>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: donorColors.background },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 36, alignItems: 'center' },
  content: { width: '100%', maxWidth: 470, gap: 16 },
  intro: { gap: 8, paddingBottom: 6 },
  brand: { color: donorColors.green, fontSize: 36, fontWeight: '800' },
  description: { color: donorColors.secondary, fontSize: 16, lineHeight: 23 },
  card: {
    backgroundColor: donorColors.surface,
    borderColor: donorColors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
  },
  retry: { gap: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  link: {
    color: donorColors.green,
    fontSize: 16,
    minHeight: 48,
    paddingVertical: 12,
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

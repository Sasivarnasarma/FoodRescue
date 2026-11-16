import type { User } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AccountButton, AccountError } from './donor-controls';
import { DonorProfile } from './donor-profile';
import { ProfileStatus } from './organization-account';
import { useDonorProfile } from '@/hooks/use-donor-profile';
import { signOutAccount } from '@/lib/auth';

function RoleCard({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  color = '#167044',
  bgColor = '#E1F3E8',
}: {
  icon: string;
  title: string;
  subtitle: string;
  badge: string;
  onPress: () => void;
  color?: string;
  bgColor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.roleCard,
        pressed && styles.roleCardPressed,
      ]}
    >
      <View style={[styles.roleIconBox, { backgroundColor: bgColor }]}>
        <Text style={styles.roleIcon}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleSubtitle}>{subtitle}</Text>
        <Text style={[styles.roleBadge, { color }]}>{badge}</Text>
      </View>
    </Pressable>
  );
}

export function AccountProfile({ user }: { user: User }) {
  const { account, profile, error, retry } = useDonorProfile(user.uid);
  const [choice, setChoice] = useState<'provider' | 'organization'>();
  const [signOutError, setSignOutError] = useState('');

  if (error)
    return (
      <View style={{ gap: 12 }}>
        <AccountError message={error.message} />
        <AccountButton label="Retry" onPress={retry} />
      </View>
    );

  if (!account || !profile)
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#167044" />
        <Text style={styles.loadingText}>Loading account details…</Text>
      </View>
    );

  const role = account.data?.role ?? profile.data?.type ?? choice;
  if (role === 'provider') return <DonorProfile user={user} />;
  if (role === 'organization')
    return <ProfileStatus uid={user.uid} user={user} />;

  return (
    <View style={styles.roleSelectionContainer}>
      {account.fromCache || profile.fromCache ? (
        <Text style={styles.offlineText}>
          Connect to the internet to load your account.
        </Text>
      ) : (
        <>
          <View style={{ gap: 6, marginBottom: 8 }}>
            <Text accessibilityRole="header" style={styles.choiceHeader}>
              Choose Your Account Role
            </Text>
            <Text style={styles.choiceSubtitle}>
              Select how your organization participates in FoodRescue:
            </Text>
          </View>

          <View style={{ gap: 14 }}>
            <RoleCard
              icon="🏪"
              title="Food Provider / Donor"
              subtitle="Restaurants, bakeries, cafes & grocers with surplus food to share."
              badge="Post Surplus • Free Pickups →"
              color="#167044"
              bgColor="#E1F3E8"
              onPress={() => setChoice('provider')}
            />

            <RoleCard
              icon="🤝"
              title="Recipient Organization"
              subtitle="Charities, shelters, food banks & community groups feeding people."
              badge="Browse Donations • Request Food →"
              color="#0284C7"
              bgColor="#E0F2FE"
              onPress={() => setChoice('organization')}
            />
          </View>
        </>
      )}

      {signOutError ? <AccountError message={signOutError} /> : null}

      <View style={{ paddingTop: 16 }}>
        <AccountButton
          label="Sign out"
          secondary
          onPress={() => {
            void signOutAccount().catch(() =>
              setSignOutError('Could not sign out. Try again.'),
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  roleSelectionContainer: {
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },
  offlineText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  choiceHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  choiceSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  roleCardPressed: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    transform: [{ scale: 0.99 }],
  },
  roleIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIcon: {
    fontSize: 24,
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  roleSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  roleBadge: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});

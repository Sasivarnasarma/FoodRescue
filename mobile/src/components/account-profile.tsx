import type { User } from 'firebase/auth';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AccountButton, AccountError } from './donor-controls';
import { DonorProfile } from './donor-profile';
import { ProfileStatus } from './organization-account';
import { useDonorProfile } from '@/hooks/use-donor-profile';
import { signOutAccount } from '@/lib/auth';

export function AccountProfile({ user }: { user: User }) {
  const { account, profile, error, retry } = useDonorProfile(user.uid);
  const [choice, setChoice] = useState<'provider' | 'organization'>();
  const [signOutError, setSignOutError] = useState('');
  if (error)
    return (
      <View>
        <AccountError message={error.message} />
        <AccountButton label="Retry" onPress={retry} />
      </View>
    );
  if (!account || !profile)
    return <ActivityIndicator accessibilityLabel="Loading account" />;
  const role = account.data?.role ?? profile.data?.type ?? choice;
  if (role === 'provider') return <DonorProfile user={user} />;
  return (
    <View style={{ gap: 16 }}>
      {role === 'organization' ? (
        <ProfileStatus uid={user.uid} />
      ) : account.fromCache || profile.fromCache ? (
        <Text>Connect to the internet to load your account.</Text>
      ) : (
        <>
          <Text accessibilityRole="header">How will you use FoodRescue?</Text>
          <AccountButton
            label="Donate as a business"
            onPress={() => setChoice('provider')}
          />
          <AccountButton
            label="Receive as an organization"
            onPress={() => setChoice('organization')}
          />
        </>
      )}
      {signOutError ? <AccountError message={signOutError} /> : null}
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
  );
}

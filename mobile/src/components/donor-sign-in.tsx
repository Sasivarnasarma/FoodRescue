import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AccountButton,
  AccountError,
  AccountField,
  accountErrorMessage,
  SegmentedTabs,
} from '@/components/donor-controls';
import { createAccount, signInAccount } from '@/lib/auth';

export function DonorSignIn() {
  const [tab, setTab] = useState<'signin' | 'create'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const creating = tab === 'create';

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
      setMessage('Enter a valid email address.');
      return;
    }
    if (!password || (creating && password.length < 6)) {
      setMessage(
        creating
          ? 'Use at least six characters for your password.'
          : 'Enter your password.',
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (creating) {
        await createAccount(email, password);
      } else {
        await signInAccount(email, password);
      }
    } catch (error) {
      setMessage(accountErrorMessage(error, 'Unable to continue. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <SegmentedTabs
        tabs={[
          { id: 'signin', label: 'Sign In' },
          { id: 'create', label: 'Create Account' },
        ]}
        selected={tab}
        onSelect={(newTab) => {
          setTab(newTab);
          setMessage('');
          setPassword('');
        }}
      />

      <AccountField
        label="Email address"
        value={email}
        onChangeText={setEmail}
        placeholder="your.email@organization.org"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        autoCorrect={false}
        editable={!busy}
      />
      <AccountField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••••••"
        autoCapitalize="none"
        autoComplete={creating ? 'new-password' : 'current-password'}
        secureTextEntry
        editable={!busy}
      />

      {!!message && <AccountError message={message} />}

      <AccountButton
        label={
          busy ? 'Please wait…' : creating ? 'Create Account →' : 'Sign In →'
        }
        disabled={busy}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
});

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AccountButton,
  AccountError,
  AccountField,
  accountErrorMessage,
  donorColors,
} from '@/components/donor-controls';
import { createAccount, signInAccount } from '@/lib/auth';

export function DonorSignIn() {
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

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
      <Text accessibilityRole="header" style={styles.title}>
        {creating ? 'Create account' : 'Sign in'}
      </Text>
      <AccountField
        label="Email address"
        value={email}
        onChangeText={setEmail}
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
        autoCapitalize="none"
        autoComplete={creating ? 'new-password' : 'current-password'}
        secureTextEntry
        editable={!busy}
      />
      {!!message && <AccountError message={message} />}
      <AccountButton
        label={busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}
        disabled={busy}
        onPress={submit}
      />
      <AccountButton
        label={creating ? 'I already have an account' : 'Create an account'}
        secondary
        disabled={busy}
        onPress={() => {
          setPassword('');
          setMessage('');
          setCreating((value) => !value);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  title: { color: donorColors.text, fontSize: 22, fontWeight: '700' },
});

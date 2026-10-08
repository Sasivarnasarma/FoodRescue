import { FirebaseError } from 'firebase/app';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

export const donorColors = {
  background: '#F4F8F5',
  surface: '#ffffff',
  text: '#152A20',
  secondary: '#4B6255',
  green: '#167044',
  lightGreen: '#e1f3e8',
  border: '#becfc4',
  danger: '#8c241d',
  amber: '#704611',
};

export function AccountButton({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AccountField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={donorColors.secondary}
        style={styles.input}
      />
    </View>
  );
}

export function AccountError({ message }: { message: string }) {
  return (
    <Text accessibilityLiveRegion="polite" style={styles.error}>
      {message}
    </Text>
  );
}

export function accountErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof FirebaseError)) return fallback;
  switch (error.code) {
    case 'auth/network-request-failed':
    case 'unavailable':
    case 'firestore/unavailable':
      return 'Check your internet connection and try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Sign in to continue.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait before trying again.';
    case 'permission-denied':
    case 'firestore/permission-denied':
      return 'This account does not have permission to complete the action.';
    default:
      return fallback;
  }
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: donorColors.green,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButton: {
    backgroundColor: donorColors.lightGreen,
  },
  buttonText: {
    color: donorColors.surface,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryText: {
    color: donorColors.green,
  },
  dimmed: {
    opacity: 0.65,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: donorColors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    backgroundColor: donorColors.surface,
    borderColor: donorColors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: donorColors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  error: {
    color: donorColors.danger,
    fontSize: 15,
    lineHeight: 21,
  },
});

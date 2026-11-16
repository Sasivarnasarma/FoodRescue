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
  background: '#F8FAFC',
  surface: '#ffffff',
  text: '#0F172A',
  secondary: '#64748B',
  green: '#167044',
  greenDark: '#115533',
  lightGreen: '#E1F3E8',
  border: '#E2E8F0',
  borderFocus: '#167044',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',
  amber: '#B45309',
  amberLight: '#FEF3C7',
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
        secondary ? styles.secondaryButton : styles.primaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
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
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
    </View>
  );
}

export function AccountError({ message }: { message: string }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text accessibilityLiveRegion="polite" style={styles.error}>
        {message}
      </Text>
    </View>
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  selected,
  onSelect,
}: {
  tabs: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View style={styles.segmentContainer}>
      {tabs.map((tab) => {
        const active = selected === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            style={[styles.segmentTab, active && styles.segmentTabActive]}
          >
            <Text
              style={[
                styles.segmentTabText,
                active && styles.segmentTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
      return 'Choose a stronger password (at least 6 characters).';
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
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: '#167044',
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  secondaryText: {
    color: '#334155',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorIcon: {
    fontSize: 14,
  },
  error: {
    color: '#DC2626',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    flex: 1,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTabTextActive: {
    color: '#167044',
    fontWeight: '700',
  },
});

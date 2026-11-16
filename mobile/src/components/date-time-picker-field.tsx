import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCurrentTime } from '../hooks/use-current-time';
import { localDateText, parseLocalDate } from '../lib/listing-form-validation';

export interface DateTimePickerFieldProps {
  label: string;
  value: string; // 'YYYY-MM-DD HH:mm' or ''
  onChangeText: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  minDate?: Date;
  maxDate?: Date;
  optional?: boolean;
  presets?: { label: string; offsetMinutes: number }[];
}

export function DateTimePickerField({
  label,
  value,
  onChangeText,
  editable = true,
  minDate,
  maxDate,
  optional = false,
  presets,
}: DateTimePickerFieldProps) {
  const [showManual, setShowManual] = useState(false);
  const currentTime = useCurrentTime();

  // Parse current value to Date, or fallback to current time
  const getCurrentDate = (): Date => {
    if (value && value.trim()) {
      try {
        return parseLocalDate(value);
      } catch {
        // invalid string fallback
      }
    }
    return currentTime;
  };

  const setDateValue = (newDate: Date) => {
    onChangeText(localDateText(newDate));
  };

  const handlePickDate = () => {
    if (!editable) return;
    const current = getCurrentDate();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: minDate,
        maximumDate: maxDate,
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            const updated = new Date(current);
            updated.setFullYear(
              selectedDate.getFullYear(),
              selectedDate.getMonth(),
              selectedDate.getDate(),
            );
            setDateValue(updated);
          }
        },
      });
    }
  };

  const handlePickTime = () => {
    if (!editable) return;
    const current = getCurrentDate();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'time',
        is24Hour: true,
        onChange: (event, selectedTime) => {
          if (event.type === 'set' && selectedTime) {
            const updated = new Date(current);
            updated.setHours(
              selectedTime.getHours(),
              selectedTime.getMinutes(),
              0,
              0,
            );
            setDateValue(updated);
          }
        },
      });
    }
  };

  const handleApplyPreset = (offsetMinutes: number) => {
    if (!editable) return;
    const target = new Date(currentTime.getTime() + offsetMinutes * 60 * 1000);
    setDateValue(target);
  };

  const handleClear = () => {
    if (!editable) return;
    onChangeText('');
  };

  // Format readable display
  const getReadableDisplay = () => {
    if (!value || !value.trim()) {
      return optional ? 'Not set (Optional)' : 'Tap to select date & time';
    }
    try {
      const d = parseLocalDate(value);
      const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
      const monthName = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const year = d.getFullYear();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      return `${dayName}, ${monthName} ${year} at ${timeStr}`;
    } catch {
      return value;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional && value ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleClear}
            disabled={!editable}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>✕ Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Main interactive display card */}
      <View style={styles.displayCard}>
        <View style={styles.valueRow}>
          <Text style={styles.calendarIcon}>📅</Text>
          <View style={styles.valueTextContainer}>
            <Text
              style={[styles.readableValue, !value && styles.placeholderValue]}
              numberOfLines={1}
            >
              {getReadableDisplay()}
            </Text>
            {value ? <Text style={styles.rawTimestamp}>{value}</Text> : null}
          </View>
        </View>

        {/* Action button row with clear borders and comfortable padding */}
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            onPress={handlePickDate}
            disabled={!editable}
            style={({ pressed }) => [
              styles.pickerBtn,
              pressed && styles.btnPressed,
              !editable && styles.btnDisabled,
            ]}
          >
            <Text style={styles.pickerBtnText}>📅 Select Date</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handlePickTime}
            disabled={!editable}
            style={({ pressed }) => [
              styles.pickerBtn,
              pressed && styles.btnPressed,
              !editable && styles.btnDisabled,
            ]}
          >
            <Text style={styles.pickerBtnText}>⏰ Select Time</Text>
          </Pressable>
        </View>

        {/* Optional quick preset chips */}
        {presets && presets.length > 0 && editable ? (
          <View style={styles.presetsRow}>
            {presets.map((preset) => (
              <Pressable
                key={preset.label}
                accessibilityRole="button"
                onPress={() => handleApplyPreset(preset.offsetMinutes)}
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Expandable manual entry fallback */}
      <View style={styles.manualRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowManual((v) => !v)}
          style={styles.manualToggle}
        >
          <Text style={styles.manualToggleText}>
            {showManual
              ? 'Hide manual input ▲'
              : 'Edit as text (YYYY-MM-DD HH:mm) ▼'}
          </Text>
        </Pressable>
        {showManual ? (
          <TextInput
            accessibilityLabel={`${label} manual input`}
            value={value}
            onChangeText={onChangeText}
            placeholder="YYYY-MM-DD HH:mm"
            placeholderTextColor="#94A3B8"
            editable={editable}
            style={styles.manualInput}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    marginVertical: 4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.1,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  displayCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 14,
    gap: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarIcon: {
    fontSize: 22,
  },
  valueTextContainer: {
    flex: 1,
  },
  readableValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  placeholderValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  rawTimestamp: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#167044',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#167044',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  pickerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#167044',
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  btnDisabled: {
    opacity: 0.5,
    borderColor: '#CBD5E1',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  presetChip: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
  },
  manualRow: {
    gap: 4,
  },
  manualToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  manualToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284C7',
  },
  manualInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

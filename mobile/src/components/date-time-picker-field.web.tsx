import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  optional = false,
  presets,
}: DateTimePickerFieldProps) {
  const [showManual, setShowManual] = useState(false);
  const currentTime = useCurrentTime();

  // Extract separate date (YYYY-MM-DD) and time (HH:mm) strings
  const parseParts = () => {
    if (value && value.trim()) {
      const parts = value.trim().split(/[ T]/);
      return {
        datePart: parts[0] || '',
        timePart: parts[1] || '',
      };
    }
    return { datePart: '', timePart: '' };
  };

  const { datePart, timePart } = parseParts();

  const handleDateChange = (newDateStr: string) => {
    if (!editable) return;
    const time = timePart || '12:00';
    if (!newDateStr) {
      if (optional) onChangeText('');
      return;
    }
    onChangeText(`${newDateStr} ${time}`);
  };

  const handleTimeChange = (newTimeStr: string) => {
    if (!editable) return;
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultDate = `${currentTime.getFullYear()}-${pad(currentTime.getMonth() + 1)}-${pad(currentTime.getDate())}`;
    const date = datePart || defaultDate;
    if (!newTimeStr) return;
    onChangeText(`${date} ${newTimeStr}`);
  };

  const handleApplyPreset = (offsetMinutes: number) => {
    if (!editable) return;
    const target = new Date(currentTime.getTime() + offsetMinutes * 60 * 1000);
    onChangeText(localDateText(target));
  };

  const handleClear = () => {
    if (!editable) return;
    onChangeText('');
  };

  const getReadableDisplay = () => {
    if (!value || !value.trim()) {
      return optional ? 'Not set (Optional)' : 'Select date & time';
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

        {/* Web Date and Time Native Inputs Row */}
        <View style={styles.webInputsRow}>
          <View style={styles.inputCol}>
            <Text style={styles.inputSubLabel}>Date</Text>
            <input
              type="date"
              value={datePart}
              disabled={!editable}
              onChange={(e) => handleDateChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1.5px solid #167044',
                backgroundColor: '#ffffff',
                fontSize: '13px',
                fontWeight: '600',
                color: '#0F172A',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </View>

          <View style={styles.inputCol}>
            <Text style={styles.inputSubLabel}>Time</Text>
            <input
              type="time"
              value={timePart}
              disabled={!editable}
              onChange={(e) => handleTimeChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1.5px solid #167044',
                backgroundColor: '#ffffff',
                fontSize: '13px',
                fontWeight: '600',
                color: '#0F172A',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </View>
        </View>

        {/* Optional quick preset pills */}
        {presets && presets.length > 0 && editable ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
          >
            {presets.map((preset) => (
              <Pressable
                key={preset.label}
                accessibilityRole="button"
                onPress={() => handleApplyPreset(preset.offsetMinutes)}
                style={({ pressed }) => [
                  styles.presetChip,
                  pressed && styles.presetChipPressed,
                ]}
              >
                <Text style={styles.presetChipText}>{preset.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

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
    fontFamily: 'monospace',
  },
  webInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputCol: {
    flex: 1,
    gap: 4,
  },
  inputSubLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  presetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 2,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  presetChip: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: '#A5D6A7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  presetChipPressed: {
    backgroundColor: '#C8E6C9',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B5E20',
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
    fontFamily: 'monospace',
  },
});

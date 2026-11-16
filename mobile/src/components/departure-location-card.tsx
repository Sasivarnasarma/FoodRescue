import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AccountButton, AccountError, AccountField } from './donor-controls';
import {
  formatCoordinates,
  getRequestDistanceInfo,
  parseDepartureCoordinates,
  type Coordinates,
} from '../lib/departure-location';
import {
  getCurrentDeviceLocation,
  reverseGeocode,
} from '../lib/location-service';

export interface DepartureLocationCardProps {
  departureLocation: Coordinates | null;
  onLocationChange: (location: Coordinates | null, address?: string) => void;
  pickupLocation?: Coordinates | null;
  disabled?: boolean;
  initialAddress?: string;
  title?: string;
}

export function DepartureLocationCard({
  departureLocation,
  onLocationChange,
  pickupLocation,
  disabled = false,
  initialAddress = '',
  title = 'Proposed departure point (Optional)',
}: DepartureLocationCardProps) {
  const [latitude, setLatitude] = useState(
    departureLocation ? String(departureLocation.latitude) : '',
  );
  const [longitude, setLongitude] = useState(
    departureLocation ? String(departureLocation.longitude) : '',
  );
  const [address, setAddress] = useState(initialAddress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showManual, setShowManual] = useState(false);
  const lock = useRef(false);

  const distanceInfo = getRequestDistanceInfo(
    departureLocation,
    pickupLocation,
  );

  const handleUseGps = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');

    try {
      const coords = await getCurrentDeviceLocation();
      setLatitude(String(coords.latitude));
      setLongitude(String(coords.longitude));

      let resolvedAddress = address;
      try {
        const geocoded = await reverseGeocode(coords);
        if (geocoded) {
          resolvedAddress = geocoded;
          setAddress(geocoded);
        }
      } catch {
        // Reverse geocoding failure is non-blocking (e.g. offline)
      }

      onLocationChange(
        { latitude: coords.latitude, longitude: coords.longitude },
        resolvedAddress,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not obtain device location. Try manual entry.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const handleApplyManual = () => {
    try {
      const parsed = parseDepartureCoordinates(latitude, longitude);
      setError('');
      onLocationChange(parsed, address);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const handleClear = () => {
    setLatitude('');
    setLongitude('');
    setAddress('');
    setError('');
    onLocationChange(null, '');
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.caption}>
        Adding your operational departure point helps donors assess pickup
        feasibility. Missing coordinates do not block your request.
      </Text>

      {/* Selected location indicator */}
      {departureLocation ? (
        <View style={styles.selectedBox}>
          <View style={styles.selectedHeaderRow}>
            <Text style={styles.selectedLabel}>Selected departure point:</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Remove departure point coordinates"
              disabled={disabled || busy}
              onPress={handleClear}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.coordinatesText}>
            {formatCoordinates(departureLocation)}
          </Text>
          {address ? (
            <Text style={styles.addressText} numberOfLines={2}>
              {address}
            </Text>
          ) : null}

          {/* Distance calculation feedback */}
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceBadgeText}>
              {distanceInfo.isAvailable
                ? `Straight-line to pickup: ${distanceInfo.formattedDistance}`
                : distanceInfo.explanation}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.unselectedBox}>
          <Text style={styles.unselectedText}>
            No departure point set. Distance will be marked as unavailable to
            the donor.
          </Text>
        </View>
      )}

      {/* GPS Button */}
      <AccountButton
        label={busy ? 'Acquiring GPS position…' : 'Use current device location'}
        disabled={disabled || busy}
        onPress={() => void handleUseGps()}
      />

      {/* Toggle Manual Entry */}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={disabled || busy}
        style={styles.toggleManualButton}
        onPress={() => setShowManual((prev) => !prev)}
      >
        <Text style={styles.toggleManualText}>
          {showManual
            ? '▲ Hide manual coordinates entry'
            : '▼ Enter coordinates manually'}
        </Text>
      </TouchableOpacity>

      {/* Manual Coordinates Form */}
      {showManual ? (
        <View style={styles.manualContainer}>
          <AccountField
            label="Latitude (-90 to 90)"
            value={latitude}
            editable={!disabled && !busy}
            keyboardType="numbers-and-punctuation"
            placeholder="e.g. 6.92710"
            onChangeText={(text) => {
              setLatitude(text);
              if (error) setError('');
            }}
          />
          <AccountField
            label="Longitude (-180 to 180)"
            value={longitude}
            editable={!disabled && !busy}
            keyboardType="numbers-and-punctuation"
            placeholder="e.g. 79.86120"
            onChangeText={(text) => {
              setLongitude(text);
              if (error) setError('');
            }}
          />
          <AccountButton
            label="Apply coordinates"
            secondary
            disabled={disabled || busy || !latitude.trim() || !longitude.trim()}
            onPress={handleApplyManual}
          />
        </View>
      ) : null}

      {/* Loading state indicator */}
      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color="#167044" />
          <Text style={styles.busyText}>Accessing location hardware…</Text>
        </View>
      ) : null}

      {/* Error state and permission fallback */}
      {error ? (
        <View style={styles.errorContainer}>
          <AccountError message={error} />
          {error.toLowerCase().includes('settings') ||
          error.toLowerCase().includes('permission') ||
          error.toLowerCase().includes('blocked') ? (
            <AccountButton
              label="Open device Settings"
              secondary
              onPress={() => {
                void Linking.openSettings().catch(() =>
                  setError(
                    'Open device Settings manually to enable location access.',
                  ),
                );
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  caption: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  selectedBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  selectedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#fee2e2',
  },
  clearButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#991b1b',
  },
  coordinatesText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  addressText: {
    fontSize: 12,
    color: '#475569',
  },
  distanceBadge: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    alignSelf: 'flex-start',
  },
  distanceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369a1',
  },
  unselectedBox: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  unselectedText: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
  },
  toggleManualButton: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  toggleManualText: {
    fontSize: 13,
    color: '#167044',
    fontWeight: '600',
  },
  manualContainer: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  busyText: {
    fontSize: 13,
    color: '#167044',
  },
  errorContainer: {
    gap: 8,
    marginTop: 4,
  },
});

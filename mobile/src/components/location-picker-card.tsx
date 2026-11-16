import { useRef, useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { AccountButton, AccountField, AccountError } from './donor-controls';
import { parseCoordinates } from '../lib/listing-helpers';
import {
  getCurrentDeviceLocation,
  reverseGeocode,
  type LocationCoordinates,
} from '../lib/location-service';
interface Props {
  location: LocationCoordinates | null;
  address: string;
  onLocationChange: (
    location: LocationCoordinates | null,
    address: string,
  ) => void;
  disabled?: boolean;
  title?: string;
}
export function LocationPickerCard({
  location,
  address,
  onLocationChange,
  disabled = false,
  title = 'Pickup location',
}: Props) {
  const [latitude, setLatitude] = useState(
    location ? String(location.latitude) : '',
  );
  const [longitude, setLongitude] = useState(
    location ? String(location.longitude) : '',
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  async function gps() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const coords = await getCurrentDeviceLocation();
      const label = await reverseGeocode(coords);
      setLatitude(String(coords.latitude));
      setLongitude(String(coords.longitude));
      onLocationChange(coords, label || address);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not get location.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={styles.title}>
          📍 {title}
        </Text>
      </View>
      <AccountButton
        label={busy ? 'Getting location…' : '📍 Use current location'}
        disabled={disabled || busy}
        onPress={() => void gps()}
      />
      <AccountField
        label="Address / pickup instructions"
        value={address}
        maxLength={200}
        editable={!disabled && !busy}
        onChangeText={(text) => onLocationChange(location, text)}
      />
      <View style={styles.coordRow}>
        <View style={styles.coordCol}>
          <AccountField
            label="Latitude"
            value={latitude}
            editable={!disabled && !busy}
            keyboardType="numbers-and-punctuation"
            onChangeText={(text) => {
              setLatitude(text);
              onLocationChange(null, address);
            }}
          />
        </View>
        <View style={styles.coordCol}>
          <AccountField
            label="Longitude"
            value={longitude}
            editable={!disabled && !busy}
            keyboardType="numbers-and-punctuation"
            onChangeText={(text) => {
              setLongitude(text);
              onLocationChange(null, address);
            }}
          />
        </View>
      </View>
      <AccountButton
        label="Use entered coordinates"
        secondary
        disabled={disabled || busy}
        onPress={() => {
          try {
            onLocationChange(parseCoordinates(latitude, longitude), address);
            setError('');
          } catch (cause) {
            setError((cause as Error).message);
          }
        }}
      />
      {location && (
        <View style={styles.selectedBadge}>
          <Text
            accessibilityLiveRegion="polite"
            style={styles.selectedBadgeText}
          >
            ✓ Coordinates confirmed: {location.latitude.toFixed(5)},{' '}
            {location.longitude.toFixed(5)}
          </Text>
        </View>
      )}
      {error ? (
        <View style={styles.errorContainer}>
          <AccountError message={error} />
          <AccountButton
            label="⚙️ Open device Settings"
            secondary
            onPress={() => {
              void Linking.openSettings().catch(() =>
                setError(
                  'Open device Settings to change location permissions.',
                ),
              );
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = {
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  headerRow: {
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#0F172A',
  },
  coordRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  coordCol: {
    flex: 1,
  },
  selectedBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#15803D',
  },
  errorContainer: {
    gap: 8,
  },
};

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  capturePhotoFromCamera,
  pickPhotoFromGallery,
  type CompressedPhotoResult,
} from '../lib/image-service';

interface PhotoAttachmentCardProps {
  photo: CompressedPhotoResult | null;
  onPhotoSelected: (photo: CompressedPhotoResult | null) => void;
  disabled?: boolean;
  embedded?: boolean;
}

export function PhotoAttachmentCard({
  photo,
  onPhotoSelected,
  disabled = false,
  embedded = false,
}: PhotoAttachmentCardProps) {
  const picking = useRef(false);
  const [compressing, setCompressing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCamera = async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      setErrorMessage(null);
      setCompressing(true);
      const result = await capturePhotoFromCamera();
      if (result) {
        onPhotoSelected(result);
      }
    } catch (err: unknown) {
      setErrorMessage(
        (err instanceof Error ? err.message : '') || 'Failed to capture photo.',
      );
    } finally {
      picking.current = false;
      setCompressing(false);
    }
  };

  const handleGallery = async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      setErrorMessage(null);
      setCompressing(true);
      const result = await pickPhotoFromGallery();
      if (result) {
        onPhotoSelected(result);
      }
    } catch (err: unknown) {
      setErrorMessage(
        (err instanceof Error ? err.message : '') || 'Failed to select photo.',
      );
    } finally {
      picking.current = false;
      setCompressing(false);
    }
  };

  const handleRemove = () => {
    setErrorMessage(null);
    onPhotoSelected(null);
  };

  return (
    <View style={[styles.card, embedded && styles.embeddedCard]}>
      {!embedded && (
        <>
          <Text style={styles.title}>Listing Photo (Optional)</Text>
          <Text style={styles.subtitle}>
            Optional photo. You can continue without a photo.
          </Text>
        </>
      )}

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              void Linking.openSettings().catch(() =>
                setErrorMessage(
                  'Open device Settings to update camera permissions.',
                ),
              );
            }}
          >
            <Text>Open device Settings</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {compressing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#167044" />
          <Text style={styles.loadingText}>
            Compressing image under 150 KiB...
          </Text>
        </View>
      ) : photo ? (
        <View style={styles.previewContainer}>
          <Image
            accessibilityLabel="Selected donation photo"
            source={{ uri: photo.uri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <View style={styles.previewInfo}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {Math.round(photo.byteSize / 1024)} KiB (Limit: 150 KiB)
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.removeButton}
              onPress={handleRemove}
              disabled={disabled || compressing}
            >
              <Text style={styles.removeButtonText}>Remove Photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.actionButton, disabled && styles.buttonDisabled]}
            onPress={handleCamera}
            disabled={disabled || compressing}
          >
            <Text style={styles.actionButtonText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={[
              styles.actionButton,
              styles.secondaryButton,
              disabled && styles.buttonDisabled,
            ]}
            onPress={handleGallery}
            disabled={disabled || compressing}
          >
            <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
              Choose from Gallery
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginVertical: 4,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  embeddedCard: {
    backgroundColor: 'transparent',
    padding: 0,
    marginVertical: 0,
    borderWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#167044',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#115533',
  },
  secondaryButton: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#334155',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#167044',
  },
  previewContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewImage: {
    width: '100%',
    height: 180,
  },
  previewInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  badge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#15803d',
  },
  removeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeButtonText: {
    fontSize: 13,
    color: '#b91c1c',
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
  },
});

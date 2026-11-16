import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { useDevicePermission } from '../hooks/use-device-permission';
import { parsePickupReference, type QrParseResult } from '../lib/qr-service';

export interface QrScannerCardProps {
  onScanSuccess: (listingId: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  title?: string;
  expectedListingId?: string;
}

export function QrScannerCard({
  onScanSuccess,
  onCancel,
  disabled = false,
  title = 'Scan Pickup QR',
  expectedListingId,
}: QrScannerCardProps) {
  const {
    permission,
    busy: permissionBusy,
    error: permissionError,
    request: requestPermission,
    openSettings,
  } = useDevicePermission('camera');
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualInput, setManualInput] = useState('');
  const [error, setError] = useState('');
  const [scannedId, setScannedId] = useState<string | null>(null);
  const scanLock = useRef(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => listener.remove();
  }, []);

  const handleBarcodeScanned = (scannedData: string) => {
    if (scanLock.current || disabled) return;
    scanLock.current = true;

    setError('');
    const result: QrParseResult = parsePickupReference(scannedData);

    if (!result.valid || !result.listingId) {
      setError(
        result.error ||
          'Invalid QR code. Please scan a valid FoodRescue pickup reference.',
      );
      scanLock.current = false;
      return;
    }

    if (expectedListingId && result.listingId !== expectedListingId) {
      setError(
        `Scanned reference (${result.listingId}) does not match this donation (${expectedListingId}).`,
      );
      scanLock.current = false;
      return;
    }

    scanLock.current = true;
    setScannedId(result.listingId);
    onScanSuccess(result.listingId);
  };

  const handleManualSubmit = () => {
    if (scanLock.current || disabled) return;
    setError('');
    const trimmed = manualInput.trim();
    if (!trimmed) {
      setError('Enter a pickup reference ID.');
      return;
    }

    const result = parsePickupReference(trimmed);
    if (!result.valid || !result.listingId) {
      setError(result.error || 'Invalid pickup reference ID.');
      return;
    }

    if (expectedListingId && result.listingId !== expectedListingId) {
      setError(
        `Entered reference (${result.listingId}) does not match this donation (${expectedListingId}).`,
      );
      return;
    }

    scanLock.current = true;
    setScannedId(result.listingId);
    onScanSuccess(result.listingId);
  };

  const handleResetScan = () => {
    scanLock.current = false;
    setScannedId(null);
    setError('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {onCancel ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onCancel}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs: Camera scan vs Manual entry */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'camera' }}
          style={[
            styles.tabButton,
            activeTab === 'camera' && styles.tabButtonActive,
          ]}
          onPress={() => {
            setActiveTab('camera');
            setError('');
          }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'camera' && styles.tabTextActive,
            ]}
          >
            📷 Scan QR Code
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'manual' }}
          style={[
            styles.tabButton,
            activeTab === 'manual' && styles.tabButtonActive,
          ]}
          onPress={() => {
            setActiveTab('manual');
            setError('');
          }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'manual' && styles.tabTextActive,
            ]}
          >
            ⌨️ Enter Manually
          </Text>
        </TouchableOpacity>
      </View>

      {/* Camera Scanner View */}
      {activeTab === 'camera' && !disabled && !scannedId && foreground ? (
        <View style={styles.cameraWrapper}>
          {!permission && !permissionError ? (
            <View style={styles.permissionPlaceholder}>
              <ActivityIndicator size="small" color="#167044" />
              <Text style={styles.placeholderText}>
                Checking camera permission…
              </Text>
            </View>
          ) : !permission?.granted ? (
            <View style={styles.permissionPlaceholder}>
              <Text style={styles.permissionTitle}>Camera Access Required</Text>
              <Text style={styles.permissionBody}>
                Camera permission is needed to scan the recipient&apos;s pickup
                QR code.
              </Text>

              {!permission || permission.canAskAgain ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.actionButton}
                  disabled={permissionBusy}
                  onPress={() => void requestPermission()}
                >
                  <Text style={styles.actionButtonText}>
                    Grant Camera Access
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.actionButton}
                  disabled={permissionBusy}
                  onPress={() => void openSettings()}
                >
                  <Text style={styles.actionButtonText}>
                    Open Device Settings
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                accessibilityRole="button"
                style={styles.secondaryButton}
                onPress={() => setActiveTab('manual')}
              >
                <Text style={styles.secondaryButtonText}>
                  Enter Reference ID Manually
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cameraContainer}>
              <CameraView
                style={styles.cameraView}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
                onMountError={() =>
                  setError('Camera unavailable. Enter the reference manually.')
                }
                onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
              />
              {/* Viewfinder Target Reticle Overlay */}
              <View style={styles.reticleOverlay} pointerEvents="none">
                <View style={styles.reticleBox}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <Text style={styles.reticleHint}>
                  Align QR code inside the frame
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        /* Manual Reference Entry View */
        <View style={styles.manualContainer}>
          <Text style={styles.manualLabel}>
            Enter the listing Reference ID shown on the recipient&apos;s phone:
          </Text>
          <TextInput
            accessibilityLabel="Pickup Reference ID input"
            value={manualInput}
            onChangeText={(text) => {
              setManualInput(text);
              if (error) setError('');
            }}
            placeholder="e.g. foodrescue:v1:list123 or list123"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            style={styles.manualInput}
          />
          <TouchableOpacity
            accessibilityRole="button"
            disabled={disabled || !manualInput.trim()}
            style={[
              styles.actionButton,
              (!manualInput.trim() || disabled) && styles.disabledButton,
            ]}
            onPress={handleManualSubmit}
          >
            <Text style={styles.actionButtonText}>Verify Reference</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Scanned Success Confirmation */}
      {scannedId ? (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>
            ✓ Reference Identified: {scannedId}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleResetScan}
            style={styles.rescanButton}
          >
            <Text style={styles.rescanText}>Scan Another Code</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Error Banner */}
      {permissionError ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {permissionError}
        </Text>
      ) : null}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          {activeTab === 'camera' && !disabled && !scannedId && foreground ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleResetScan}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry Scan</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 12,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  cancelButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cancelText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#167044',
    fontWeight: '700',
  },
  cameraWrapper: {
    width: '100%',
    minHeight: 260,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  cameraContainer: {
    width: '100%',
    height: 280,
    position: 'relative',
  },
  cameraView: {
    width: '100%',
    height: '100%',
  },
  reticleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  reticleBox: {
    width: 180,
    height: 180,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#22c55e',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  reticleHint: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  permissionPlaceholder: {
    flex: 1,
    minHeight: 240,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  placeholderText: {
    fontSize: 13,
    color: '#64748b',
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  manualContainer: {
    paddingVertical: 8,
    gap: 10,
  },
  manualLabel: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  manualInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 15,
    color: '#0f172a',
  },
  actionButton: {
    maxWidth: '100%',
    backgroundColor: '#167044',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#167044',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  successBanner: {
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  rescanButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rescanText: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  retryText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

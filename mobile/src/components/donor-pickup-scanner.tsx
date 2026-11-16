import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AccountButton,
  AccountError,
  donorColors,
} from '@/components/donor-controls';
import { useDevicePermission } from '@/hooks/use-device-permission';
import { getFirebaseClients } from '@/lib/firebase';
import { getListingById, type FoodListing } from '@/lib/listings';
import { parsePickupQrPayload } from '@/lib/pickup-qr';

export interface DonorPickupScannerProps {
  visible: boolean;
  onClose: () => void;
  onSelectListing: (listing: FoodListing) => void;
}

export function DonorPickupScanner({
  visible,
  onClose,
  onSelectListing,
}: DonorPickupScannerProps) {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualInput, setManualInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const {
    permission,
    busy: permissionBusy,
    request: requestPermission,
    openSettings,
  } = useDevicePermission('camera');

  const handleReset = () => {
    setScanned(false);
    setErrorMessage(null);
    setManualInput('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleLookup = async (rawText: string) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);

    try {
      const parsed = parsePickupQrPayload(rawText);
      if (!parsed.isValid || !parsed.listingId) {
        setErrorMessage(
          parsed.error ||
            'Invalid QR code format. Please scan a valid pickup QR or enter the listing ID.',
        );
        return;
      }

      const clients = getFirebaseClients();
      const currentUser = clients.auth.currentUser;
      if (!currentUser) {
        setErrorMessage('Sign in before verifying pickups.');
        return;
      }

      const listing = await getListingById(parsed.listingId);
      if (!listing) {
        setErrorMessage(
          `Donation "${parsed.listingId}" was not found. Please verify the reference.`,
        );
        return;
      }

      if (listing.providerUid !== currentUser.uid) {
        setErrorMessage(
          'This donation belongs to another donor account. You can only manage your own listings.',
        );
        return;
      }

      // Valid listing owned by current donor
      onSelectListing(listing);
      handleClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to look up donation.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanned || busy) return;
    setScanned(true);
    void handleLookup(result.data);
  };

  const isWeb = Platform.OS === 'web';
  const hasCameraPermission = Boolean(permission?.granted);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text accessibilityRole="header" style={styles.headerTitle}>
                Pickup QR Scanner
              </Text>
              <Text style={styles.headerSubtitle}>
                Scan recipient&apos;s pickup QR code or look up reference
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close scanner"
              accessibilityRole="button"
              style={styles.closeButton}
              onPress={handleClose}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mode Switch Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'camera' }}
              style={[styles.tab, mode === 'camera' && styles.activeTab]}
              onPress={() => {
                setMode('camera');
                setErrorMessage(null);
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === 'camera' && styles.activeTabText,
                ]}
              >
                📷 Camera Scanner
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'manual' }}
              style={[styles.tab, mode === 'manual' && styles.activeTab]}
              onPress={() => {
                setMode('manual');
                setErrorMessage(null);
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === 'manual' && styles.activeTabText,
                ]}
              >
                ⌨️ Manual Reference
              </Text>
            </TouchableOpacity>
          </View>

          {/* Body Content */}
          <View style={styles.body}>
            {errorMessage && (
              <View style={styles.errorContainer}>
                <AccountError message={errorMessage} />
                {mode === 'camera' && scanned && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.retryButton}
                    onPress={() => {
                      setScanned(false);
                      setErrorMessage(null);
                    }}
                  >
                    <Text style={styles.retryButtonText}>Scan Again</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {mode === 'camera' ? (
              <View style={styles.cameraWrapper}>
                {isWeb ? (
                  <View style={styles.centeredCard}>
                    <Text style={styles.cardTitle}>Camera on Web</Text>
                    <Text style={styles.cardBody}>
                      Camera scanning is best experienced on Android or iOS
                      devices. Please use manual entry below to look up your
                      donation.
                    </Text>
                    <AccountButton
                      label="Switch to Manual Entry"
                      onPress={() => setMode('manual')}
                    />
                  </View>
                ) : !hasCameraPermission ? (
                  <View style={styles.centeredCard}>
                    <Text style={styles.cardTitle}>
                      Camera Permission Required
                    </Text>
                    <Text style={styles.cardBody}>
                      Allow FoodRescue to use your camera so you can quickly
                      scan recipient pickup QR codes during handover.
                    </Text>
                    {permission?.canAskAgain === false ? (
                      <AccountButton
                        label="Open Settings"
                        onPress={openSettings}
                      />
                    ) : (
                      <AccountButton
                        label={permissionBusy ? 'Requesting…' : 'Enable Camera'}
                        disabled={permissionBusy}
                        onPress={requestPermission}
                      />
                    )}
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.switchLink}
                      onPress={() => setMode('manual')}
                    >
                      <Text style={styles.switchLinkText}>
                        Or enter donation reference manually
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.viewfinderContainer}>
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      barcodeScannerSettings={{
                        barcodeTypes: ['qr'],
                      }}
                      onBarcodeScanned={
                        scanned || busy ? undefined : handleBarcodeScanned
                      }
                    />

                    {/* Viewfinder Target Frame Overlay */}
                    <View style={styles.targetFrame}>
                      <View style={[styles.corner, styles.cornerTL]} />
                      <View style={[styles.corner, styles.cornerTR]} />
                      <View style={[styles.corner, styles.cornerBL]} />
                      <View style={[styles.corner, styles.cornerBR]} />
                      {busy && (
                        <View style={styles.busyOverlay}>
                          <ActivityIndicator
                            size="large"
                            color={donorColors.green}
                          />
                          <Text style={styles.busyText}>
                            Looking up donation…
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.scannerInstructions}>
                      Align recipient QR code within the frame
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.manualWrapper}>
                <Text style={styles.inputLabel}>
                  Donation Listing ID or Reference
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={manualInput}
                  onChangeText={(val) => {
                    setManualInput(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="e.g. foodListing_123 or paste QR text"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                />
                <Text style={styles.inputHint}>
                  You can paste raw JSON, a FoodRescue pickup link, or the
                  direct donation ID.
                </Text>

                <AccountButton
                  label={busy ? 'Looking up…' : 'Look Up Donation'}
                  disabled={busy || !manualInput.trim()}
                  onPress={() => void handleLookup(manualInput)}
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 520,
    maxHeight: '90%',
    paddingBottom: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activeTab: {
    backgroundColor: '#e8f5e9',
    borderColor: '#167044',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#167044',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  errorContainer: {
    marginBottom: 12,
    gap: 8,
  },
  retryButton: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  retryButtonText: {
    color: '#991b1b',
    fontWeight: '600',
    fontSize: 13,
  },
  cameraWrapper: {
    flex: 1,
    minHeight: 320,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetFrame: {
    width: 220,
    height: 220,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 16,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#22c55e',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  busyOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  busyText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  scannerInstructions: {
    marginTop: 20,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  centeredCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  cardBody: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
  },
  switchLink: {
    marginTop: 8,
    padding: 6,
  },
  switchLinkText: {
    fontSize: 13,
    color: '#167044',
    textDecorationLine: 'underline',
  },
  manualWrapper: {
    paddingVertical: 12,
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  inputHint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 10,
  },
});

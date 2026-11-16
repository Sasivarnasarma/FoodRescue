import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

interface PermissionItemState {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export function PermissionManagerCard() {
  const [cameraState, setCameraState] = useState<PermissionItemState>({
    granted: false,
    canAskAgain: true,
    status: 'checking',
  });
  const [locationState, setLocationState] = useState<PermissionItemState>({
    granted: false,
    canAskAgain: true,
    status: 'checking',
  });
  const [mediaState, setMediaState] = useState<PermissionItemState>({
    granted: false,
    canAskAgain: true,
    status: 'checking',
  });
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [checking, setChecking] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const checkAllPermissions = async () => {
    try {
      if (Platform.OS === 'web') {
        setCameraState({ granted: true, canAskAgain: true, status: 'web' });
        setLocationState({ granted: true, canAskAgain: true, status: 'web' });
        setMediaState({ granted: true, canAskAgain: true, status: 'web' });
        setChecking(false);
        return;
      }

      const [cam, loc, media] = await Promise.all([
        Camera.getCameraPermissionsAsync().catch(() => null),
        Location.getForegroundPermissionsAsync().catch(() => null),
        ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null),
      ]);

      if (cam) {
        setCameraState({
          granted: cam.granted,
          canAskAgain: cam.canAskAgain,
          status: cam.status,
        });
      }
      if (loc) {
        setLocationState({
          granted: loc.granted,
          canAskAgain: loc.canAskAgain,
          status: loc.status,
        });
      }
      if (media) {
        setMediaState({
          granted: media.granted,
          canAskAgain: media.canAskAgain,
          status: media.status,
        });
      }
    } catch {
      // Ignored: fallback to current state
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      if (active) {
        await checkAllPermissions();
      }
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && active) {
        void checkAllPermissions();
      }
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const handleRequestCamera = async () => {
    setActionBusy('camera');
    try {
      if (!cameraState.canAskAgain && !cameraState.granted) {
        await Linking.openSettings();
      } else {
        const res = await Camera.requestCameraPermissionsAsync();
        setCameraState({
          granted: res.granted,
          canAskAgain: res.canAskAgain,
          status: res.status,
        });
      }
    } catch {
      await Linking.openSettings();
    } finally {
      setActionBusy(null);
    }
  };

  const handleRequestLocation = async () => {
    setActionBusy('location');
    try {
      if (!locationState.canAskAgain && !locationState.granted) {
        await Linking.openSettings();
      } else {
        const res = await Location.requestForegroundPermissionsAsync();
        setLocationState({
          granted: res.granted,
          canAskAgain: res.canAskAgain,
          status: res.status,
        });
      }
    } catch {
      await Linking.openSettings();
    } finally {
      setActionBusy(null);
    }
  };

  const handleRequestMedia = async () => {
    setActionBusy('media');
    try {
      if (!mediaState.canAskAgain && !mediaState.granted) {
        await Linking.openSettings();
      } else {
        const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setMediaState({
          granted: res.granted,
          canAskAgain: res.canAskAgain,
          status: res.status,
        });
      }
    } catch {
      await Linking.openSettings();
    } finally {
      setActionBusy(null);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      // noop
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerIconBox}>
          <Text style={{ fontSize: 22 }}>⚙️</Text>
        </View>
        <View style={styles.headerTexts}>
          <Text style={styles.title}>Permissions & Settings</Text>
          <Text style={styles.subtitle}>
            Manage device capabilities and access permissions
          </Text>
        </View>
        {checking ? (
          <ActivityIndicator size="small" color="#167044" />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={checkAllPermissions}
            style={styles.refreshBtn}
          >
            <Text style={styles.refreshBtnText}>↻ Refresh</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.permissionsList}>
        {/* Camera Permission */}
        <View style={styles.permRow}>
          <View style={styles.permIconBox}>
            <Text style={styles.permIcon}>📷</Text>
          </View>
          <View style={styles.permInfo}>
            <View style={styles.permTitleRow}>
              <Text style={styles.permTitle}>Camera</Text>
              <View
                style={[
                  styles.badge,
                  cameraState.granted ? styles.badgeSuccess : styles.badgeMuted,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    cameraState.granted
                      ? styles.badgeTextSuccess
                      : styles.badgeTextMuted,
                  ]}
                >
                  {cameraState.granted ? '✓ Enabled' : 'Not Granted'}
                </Text>
              </View>
            </View>
            <Text style={styles.permDesc}>
              Required for QR code verification at handover and taking food
              photos.
            </Text>
          </View>
          <View style={styles.permAction}>
            {cameraState.granted ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleOpenSettings}
                style={styles.manageBtn}
              >
                <Text style={styles.manageBtnText}>Settings</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={handleRequestCamera}
                disabled={actionBusy === 'camera'}
                style={styles.enableBtn}
              >
                <Text style={styles.enableBtnText}>
                  {actionBusy === 'camera' ? '…' : 'Enable'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Location Permission */}
        <View style={styles.permRow}>
          <View style={styles.permIconBox}>
            <Text style={styles.permIcon}>📍</Text>
          </View>
          <View style={styles.permInfo}>
            <View style={styles.permTitleRow}>
              <Text style={styles.permTitle}>Location (GPS)</Text>
              <View
                style={[
                  styles.badge,
                  locationState.granted
                    ? styles.badgeSuccess
                    : styles.badgeMuted,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    locationState.granted
                      ? styles.badgeTextSuccess
                      : styles.badgeTextMuted,
                  ]}
                >
                  {locationState.granted ? '✓ Enabled' : 'Not Granted'}
                </Text>
              </View>
            </View>
            <Text style={styles.permDesc}>
              Used to set pickup location coordinates and calculate recipient
              distances.
            </Text>
          </View>
          <View style={styles.permAction}>
            {locationState.granted ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleOpenSettings}
                style={styles.manageBtn}
              >
                <Text style={styles.manageBtnText}>Settings</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={handleRequestLocation}
                disabled={actionBusy === 'location'}
                style={styles.enableBtn}
              >
                <Text style={styles.enableBtnText}>
                  {actionBusy === 'location' ? '…' : 'Enable'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Photo Gallery Permission */}
        <View style={styles.permRow}>
          <View style={styles.permIconBox}>
            <Text style={styles.permIcon}>🖼️</Text>
          </View>
          <View style={styles.permInfo}>
            <View style={styles.permTitleRow}>
              <Text style={styles.permTitle}>Photo Library</Text>
              <View
                style={[
                  styles.badge,
                  mediaState.granted ? styles.badgeSuccess : styles.badgeMuted,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    mediaState.granted
                      ? styles.badgeTextSuccess
                      : styles.badgeTextMuted,
                  ]}
                >
                  {mediaState.granted ? '✓ Enabled' : 'Not Granted'}
                </Text>
              </View>
            </View>
            <Text style={styles.permDesc}>
              Allows attaching photos of surplus food from your device gallery.
            </Text>
          </View>
          <View style={styles.permAction}>
            {mediaState.granted ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleOpenSettings}
                style={styles.manageBtn}
              >
                <Text style={styles.manageBtnText}>Settings</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={handleRequestMedia}
                disabled={actionBusy === 'media'}
                style={styles.enableBtn}
              >
                <Text style={styles.enableBtnText}>
                  {actionBusy === 'media' ? '…' : 'Enable'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Local Notifications / Reminders Toggle */}
        <View style={styles.permRow}>
          <View style={styles.permIconBox}>
            <Text style={styles.permIcon}>🔔</Text>
          </View>
          <View style={styles.permInfo}>
            <View style={styles.permTitleRow}>
              <Text style={styles.permTitle}>Pickup Reminders</Text>
              <View
                style={[
                  styles.badge,
                  remindersEnabled ? styles.badgeSuccess : styles.badgeMuted,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    remindersEnabled
                      ? styles.badgeTextSuccess
                      : styles.badgeTextMuted,
                  ]}
                >
                  {remindersEnabled ? '✓ Active' : 'Off'}
                </Text>
              </View>
            </View>
            <Text style={styles.permDesc}>
              Local reminders for upcoming pickup deadlines and assigned
              handovers.
            </Text>
          </View>
          <View style={styles.permAction}>
            <Switch
              value={remindersEnabled}
              onValueChange={setRemindersEnabled}
              trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
              thumbColor={remindersEnabled ? '#167044' : '#F1F5F9'}
            />
          </View>
        </View>
      </View>

      {/* Direct System Settings Action */}
      <View style={styles.footerAction}>
        <Pressable
          accessibilityRole="button"
          onPress={handleOpenSettings}
          style={styles.systemSettingsButton}
        >
          <Text style={styles.systemSettingsIcon}>⚙️</Text>
          <Text style={styles.systemSettingsText}>
            Open Device System Settings
          </Text>
        </Pressable>
        <Text style={styles.footerNote}>
          Tap to toggle permissions in your device application manager.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    marginTop: 16,
    width: '100%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  permissionsList: {
    gap: 14,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  permIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  permIcon: {
    fontSize: 18,
  },
  permInfo: {
    flex: 1,
    gap: 4,
  },
  permTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  permTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeMuted: {
    backgroundColor: '#F1F5F9',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextSuccess: {
    color: '#15803D',
  },
  badgeTextMuted: {
    color: '#64748B',
  },
  permDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  permAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 2,
  },
  enableBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#167044',
  },
  enableBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  manageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  manageBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  footerAction: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
    alignItems: 'center',
  },
  systemSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  systemSettingsIcon: {
    fontSize: 16,
  },
  systemSettingsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  footerNote: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
});

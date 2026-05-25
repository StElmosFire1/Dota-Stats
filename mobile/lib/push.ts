// Expo push registration. Called from app/_layout.tsx after we know the
// user is signed in. Silently no-ops on simulators / web. Tokens are
// upserted server-side, so calling this on every cold start is safe.
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#c5a975',
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== 'granted') return null;

  // EAS push token. projectId is required on SDK 49+ to mint a token tied
  // to the current Expo project. We pull it from app.json via Constants;
  // dev builds without one will throw, which we surface to the caller.
  const projectId =
    (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants?.easConfig as any)?.projectId;
  const tokenResult = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenResult?.data || null;
  if (!token) return null;
  try {
    await api.registerExpoPushToken(token, {
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined,
      app_version: Constants?.expoConfig?.version || undefined,
      device_label: `${Device.manufacturer || ''} ${Device.modelName || ''}`.trim() || undefined,
    });
  } catch (err) {
    // Registration is best-effort — sign-in still proceeds even if the
    // user later toggles notifications off and we can't reach the server.
    console.warn('[push] register failed:', (err as Error).message);
  }
  return token;
}

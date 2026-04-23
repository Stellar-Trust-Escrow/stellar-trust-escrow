/**
 * Push Notification Service
 *
 * Registers the device for push notifications via Expo's notification service
 * and handles incoming notifications (foreground + background).
 *
 * Notification types mirror the backend email events:
 *   - escrow.status_changed
 *   - milestone.completed
 *   - dispute.raised
 *   - dispute.resolved
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { storage, STORAGE_KEYS } from '../lib/storage';
import { api } from '../lib/api';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers the device for push notifications and stores the Expo push token.
 * Must be called after the user connects their wallet.
 */
export async function registerForPushNotifications(stellarAddress: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a physical device.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted.');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  storage.set(STORAGE_KEYS.PUSH_TOKEN, token);

  // Register token with backend so it can send targeted pushes
  try {
    await api.post('/api/notifications/push-token', {
      address: stellarAddress,
      token,
      platform: Platform.OS,
    });
  } catch (err) {
    // Non-fatal — token stored locally, backend registration is best-effort
    console.warn('[Notifications] Failed to register token with backend:', err);
  }

  return token;
}

/**
 * Sets up notification response listener (user taps a notification).
 * Returns a cleanup function.
 */
export function setupNotificationListeners(
  onNotification: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void,
): () => void {
  const notifSub = Notifications.addNotificationReceivedListener(onNotification);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);

  return () => {
    notifSub.remove();
    responseSub.remove();
  };
}

/**
 * Schedules a local notification (used for offline reminders).
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: data ?? {} },
    trigger: null, // immediate
  });
}

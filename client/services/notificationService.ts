import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission denied');
      return { success: false, error: 'Permission denied' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return { success: false, error };
  }
}

/**
 * Get push notification token
 */
export async function getPushNotificationToken() {
  try {
    if (Platform.OS === 'web') {
      console.log('Push notifications not available on web');
      return { success: false, error: 'Not available on web' };
    }

    const appOwnership = (Constants as any)?.appOwnership;
    if (appOwnership === 'expo') {
      console.log('Push notifications not available in Expo Go');
      return { success: false, error: 'Not available in Expo Go' };
    }

    const projectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
    const token = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    return { success: true, token: token.data };
  } catch (error) {
    console.error('Error getting push token:', error);
    return { success: false, error };
  }
}

/**
 * Save push token to user profile
 */
export async function savePushToken(userId: string, token: string) {
  try {
    const { apiService } = require('@/src/_services/apiService');

    // apiService handles base URL, auth headers, and 401 clearing automatically
    const result = await apiService.put(`/users/${userId}/push-token`, { pushToken: token });

    if (result.success) {
      console.log('✅ Push token saved to backend');
      return { success: true };
    } else {
      throw new Error(result.error || 'Failed to save push token');
    }
  } catch (error) {
    console.error('Error saving push token:', error);
    return { success: false, error };
  }
}

/**
 * Send local notification
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: any
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Show immediately
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending local notification:', error);
    return { success: false, error };
  }
}

/**
 * Schedule notification for later
 */
export async function scheduleNotification(
  title: string,
  body: string,
  seconds: number,
  data?: any
) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: { seconds } as Notifications.TimeIntervalTriggerInput,
    });
    return { success: true };
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return { success: false, error };
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return { success: true };
  } catch (error) {
    console.error('Error canceling notifications:', error);
    return { success: false, error };
  }
}

/**
 * Get badge count
 */
export async function getBadgeCount() {
  try {
    const count = await Notifications.getBadgeCountAsync();
    return { success: true, count };
  } catch (error) {
    console.error('Error getting badge count:', error);
    return { success: false, error };
  }
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number) {
  try {
    await Notifications.setBadgeCountAsync(count);
    return { success: true };
  } catch (error) {
    console.error('Error setting badge count:', error);
    return { success: false, error };
  }
}

/**
 * Handle notification types and create appropriate messages
 */
export function getNotificationMessage(type: string, data: any) {
  switch (type) {
    case 'like':
      return {
        title: '❤️ New Like',
        body: `${data.userName} liked your post`,
      };
    case 'comment':
      return {
        title: '💬 New Comment',
        body: `${data.userName} commented: ${data.commentText?.substring(0, 50)}`,
      };
    case 'follow':
      return {
        title: '👤 New Follower',
        body: `${data.userName} started following you`,
      };
    case 'message':
      return {
        title: `💌 ${data.userName}`,
        body: data.messageText?.substring(0, 100) || 'Sent you a message',
      };
    case 'mention':
      return {
        title: '📢 You were mentioned',
        body: `${data.userName} mentioned you in a ${data.postType || 'post'}`,
      };
    case 'tag':
      return {
        title: '🏷️ Tagged in post',
        body: `${data.userName} tagged you in a post`,
      };
    default:
      return {
        title: 'Notification',
        body: data.message || 'You have a new notification',
      };
  }
}

/**
 * Setup notification listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
) {
  // Listener for when notification is received while app is open
  const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received:', notification);
    onNotificationReceived?.(notification);
  });

  // Listener for when notification is tapped
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Notification tapped:', response);
    onNotificationTapped?.(response);
  });

  // Return cleanup function
  return () => {
    receivedListener?.remove();
    responseListener?.remove();
  };
}

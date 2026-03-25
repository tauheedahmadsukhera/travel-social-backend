/**
 * Setup notification listeners
 * Safely handles notification initialization with error handling
 */
export function setupNotificationListeners() {
  try {
    // Dynamically import Notifications to avoid early load issues
    const Notifications = require('expo-notifications');
    const { router } = require('expo-router');
    
    if (!Notifications || !Notifications.addNotificationReceivedListener) {
      console.warn('[NotificationHandler] Notifications API not available');
      return;
    }

    // Handle notification received while app is foregrounded
    Notifications.addNotificationReceivedListener((notification: any) => {
      console.log('📬 Notification received:', notification);
    });

    // Handle notification tapped
    Notifications.addNotificationResponseReceivedListener((response: any) => {
      try {
        console.log('☝️ Notification tapped:', JSON.stringify(response, null, 2));
        
        const data = response.notification.request.content.data;
        console.log('📦 Notification data:', JSON.stringify(data, null, 2));
        
        // Navigate based on notification type
        // Match 'passport', 'passport_suggestion', or any data that has screen: 'passport'
        if (data.type === 'passport' || data.type === 'passport_suggestion' || data.screen === 'passport') {
          // Navigate to passport screen
          console.log('✈️ Navigating to passport screen from notification');
          
          // Use a small timeout to ensure the router is ready
          setTimeout(() => {
            try {
              router.push('/passport');
              console.log('✅ Navigation to /passport successful');
            } catch (error) {
              console.error('❌ Navigation to /passport failed:', error);
            }
          }, 500);
        }
      } catch (e) {
        console.error('[NotificationHandler] Error handling notification response:', e);
      }
    });
  } catch (e) {
    console.warn('[NotificationHandler] Failed to setup notification listeners:', e);
  }
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
  try {
    const Notifications = require('expo-notifications');
    if (Notifications && Notifications.dismissAllNotificationsAsync) {
      await Notifications.dismissAllNotificationsAsync();
    }
  } catch (e) {
    console.warn('[NotificationHandler] Failed to clear notifications:', e);
  }
}


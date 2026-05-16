import { by, device, element, expect } from 'detox';

describe('Core User Journey', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should complete the Login -> Home Feed -> Like Post -> Chat journey', async () => {
    // 1. Login Flow
    await expect(element(by.id('login-screen'))).toBeVisible();
    await element(by.id('email-input')).typeText('testuser@trips.com');
    await element(by.id('password-input')).typeText('Password123!');
    await element(by.id('login-button')).tap();

    // 2. View Home Feed
    await expect(element(by.id('home-feed-list'))).toBeVisible();
    
    // 3. Like the first post on the feed
    const firstPostLikeButton = element(by.id('like-button')).atIndex(0);
    await expect(firstPostLikeButton).toBeVisible();
    await firstPostLikeButton.tap();

    // 4. Open Inbox
    const inboxIcon = element(by.id('inbox-tab-icon'));
    await inboxIcon.tap();
    await expect(element(by.id('inbox-header'))).toBeVisible();

    // 5. Open Chat
    const firstConversation = element(by.id('conversation-item')).atIndex(0);
    await expect(firstConversation).toBeVisible();
    await firstConversation.tap();

    // Verify Chat Screen loaded
    await expect(element(by.id('chat-message-input'))).toBeVisible();
  });
});

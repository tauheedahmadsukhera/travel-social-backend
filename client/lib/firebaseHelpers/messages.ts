
import { apiService } from '@/src/_services/apiService';

/**
 * React to a message with an emoji (Instagram-style)
 */
export async function reactToMessage(conversationId: string, messageId: string, userId: string, emoji: string) {
  try {
    const res = await apiService.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, { userId, emoji });
    return res;
  } catch (error: any) {
    console.error('❌ reactToMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Subscribe to real-time messages in a conversation
 * Optimized polling - checks every 1 second instead of 5
 */
export function subscribeToMessages(conversationId: string, callback: (messages: any[]) => void) {
  console.log('[subscribeToMessages] Starting polling for:', conversationId);
  
  // Initial immediate fetch
  (async () => {
    try {
      const res = await apiService.get(`/conversations/${conversationId}/messages`);
      console.log('[subscribeToMessages] Initial fetch:', { success: res?.success, count: res?.messages?.length });
      if (res.success && res.messages) {
        // Reverse messages so newest are first (for inverted FlatList)
        const sortedMessages = res.messages.slice().reverse();
        callback(sortedMessages);
      }
    } catch (error) {
      console.error('[subscribeToMessages] Initial fetch error:', error);
    }
  })();

  // Then poll every 1 second (much faster than 5s)
  const pollInterval = setInterval(async () => {
    try {
      const res = await apiService.get(`/conversations/${conversationId}/messages`);
      if (res.success && res.messages) {
        // Reverse messages so newest are first (for inverted FlatList)
        const sortedMessages = res.messages.slice().reverse();
        callback(sortedMessages);
      }
    } catch (error) {
      console.error('Error polling messages:', error);
    }
  }, 1000); // 1 second instead of 5

  return () => {
    console.log('[subscribeToMessages] Stopping polling for:', conversationId);
    clearInterval(pollInterval);
  };
}

/**
 * Edit a message
 */
export async function editMessage(conversationId: string, messageId: string, userId: string, newText: string) {
  try {
    const res = await apiService.patch(`/conversations/${conversationId}/messages/${messageId}`, { userId, text: newText });
    return res;
  } catch (error: any) {
    console.error('❌ editMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(conversationId: string, messageId: string, userId: string) {
  try {
    const res = await apiService.delete(`/conversations/${conversationId}/messages/${messageId}`, { userId });
    return res;
  } catch (error: any) {
    console.error('❌ deleteMessage error:', error);
    return { success: false, error: error.message };
  }
}


// Conversation and DM helpers

import { apiService } from '@/src/_services/apiService';

// Get or create a conversation between two users
export async function getOrCreateConversation(userId1: string, userId2: string) {
  try {
    // Simple approach: generate consistent conversationId from sorted userIds
    const ids = [userId1, userId2].sort();
    const conversationId = `${ids[0]}_${ids[1]}`;
    console.log('[Conversation] Created/Got conversationId:', conversationId);
    return { success: true, conversationId };
  } catch (error: any) {
    console.error('Error in getOrCreateConversation:', error);
    return { success: false, conversationId: null, error: error.message };
  }
}

// Subscribe to user's conversations with real-time updates
export function subscribeToConversations(userId: string, callback: (convos: any[]) => void) {
  // Use polling for conversations
  const pollInterval = setInterval(async () => {
    try {
      const res = await apiService.get(`/conversations?userId=${userId}`);
      if (res.success) {
        callback(res.data || []);
      }
    } catch (error) {
      console.error('Error polling conversations:', error);
    }
  }, 10000);

  return () => clearInterval(pollInterval);
}

// Get all conversations for a user
export async function getUserConversations(userId: string) {
  try {
    const res = await apiService.get(`/conversations?userId=${userId}`);
    return res.data || [];
  } catch (error: any) {
    console.error('Error in getUserConversations:', error);
    return [];
  }
}

// Mark a conversation as read
export async function markConversationAsRead(conversationId: string, userId: string) {
  try {
    const res = await apiService.patch(`/conversations/${conversationId}/read`, { userId });
    return res;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Send a message in a conversation
export async function sendMessage(
  conversationId: string, 
  senderId: string, 
  text: string, 
  recipientId?: string,
  replyTo?: { id: string; text: string; senderId: string } | null
) {
  try {
    const messageData: any = {
      senderId,
      text,
      read: false
    };
    
    // Add recipientId if provided
    if (recipientId) {
      messageData.recipientId = recipientId;
    }
    
    // Add replyTo if replying to a message
    if (replyTo) {
      messageData.replyTo = {
        id: replyTo.id,
        text: replyTo.text,
        senderId: replyTo.senderId
      };
    }
    
    const res = await apiService.post(`/conversations/${conversationId}/messages`, messageData);
    console.log('[SendMessage] Response:', res);
    return res;
  } catch (error: any) {
    console.error('Error in sendMessage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create or update a conversation for DM/message notifications
 */
export async function upsertConversation(recipientId: string, senderId: string, message: string) {
  try {
    // Generate consistent conversationId
    const ids = [recipientId, senderId].sort();
    const conversationId = `${ids[0]}_${ids[1]}`;
    
    // Send the message
    await sendMessage(conversationId, senderId, message);
    
    console.log('[UpsertConversation] Message sent to:', conversationId);
    return { success: true, id: conversationId };
  } catch (error: any) {
    console.error('Error in upsertConversation:', error);
    return { success: false, error: error.message };
  }
}

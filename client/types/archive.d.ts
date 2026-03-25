declare module '../lib/firebaseHelpers/archive' {
  export function getArchivedConversations(userId: string): Promise<{ success: boolean; data?: any[]; error?: any }>;
  export function unarchiveConversation(conversationId: string, userId: string): Promise<{ success: boolean; error?: any }>;
  export function archiveConversation(conversationId: string, userId: string): Promise<{ success: boolean; error?: any }>;
}

declare module '../lib/firebaseHelpers/archive.js' {
  export function getArchivedConversations(userId: string): Promise<{ success: boolean; data?: any[]; error?: any }>;
  export function unarchiveConversation(conversationId: string, userId: string): Promise<{ success: boolean; error?: any }>;
  export function archiveConversation(conversationId: string, userId: string): Promise<{ success: boolean; error?: any }>;
}

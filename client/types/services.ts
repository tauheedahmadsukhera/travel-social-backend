/**
 * Service Interface Definitions
 * Abstract interfaces for all external services
 */

import {
    Comment,
    Conversation,
    Highlight,
    LiveStream,
    LocationData,
    Message,
    Notification,
    PaginatedResponse,
    PassportEntry,
    Post,
    Story,
    User
} from './models';

// ==================== DATABASE SERVICE ====================

export interface IDatabaseService {
  // User Operations
  getUser(userId: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(user: Partial<User>): Promise<string>;
  updateUser(userId: string, data: Partial<User>): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  searchUsers(query: string, limit?: number): Promise<User[]>;

  // Post Operations
  getPost(postId: string): Promise<Post | null>;
  getUserPosts(userId: string, limit?: number): Promise<Post[]>;
  createPost(post: Partial<Post>): Promise<string>;
  updatePost(postId: string, data: Partial<Post>): Promise<void>;
  deletePost(postId: string): Promise<void>;
  getFeedPosts(userId: string, limit?: number, lastDoc?: any): Promise<PaginatedResponse<Post>>;
  likePost(postId: string, userId: string): Promise<void>;
  unlikePost(postId: string, userId: string): Promise<void>;
  savePost(postId: string, userId: string): Promise<void>;
  unsavePost(postId: string, userId: string): Promise<void>;

  // Story Operations
  getStory(storyId: string): Promise<Story | null>;
  getUserStories(userId: string): Promise<Story[]>;
  createStory(story: Partial<Story>): Promise<string>;
  deleteStory(storyId: string): Promise<void>;
  viewStory(storyId: string, userId: string): Promise<void>;
  getActiveStories(limit?: number): Promise<Story[]>;

  // Comment Operations
  getComment(commentId: string): Promise<Comment | null>;
  getPostComments(postId: string): Promise<Comment[]>;
  createComment(comment: Partial<Comment>): Promise<string>;
  updateComment(commentId: string, text: string): Promise<void>;
  deleteComment(commentId: string): Promise<void>;
  likeComment(commentId: string, userId: string): Promise<void>;
  unlikeComment(commentId: string, userId: string): Promise<void>;

  // Message Operations
  getConversation(conversationId: string): Promise<Conversation | null>;
  getUserConversations(userId: string): Promise<Conversation[]>;
  getOrCreateConversation(userId1: string, userId2: string): Promise<string>;
  sendMessage(message: Partial<Message>): Promise<string>;
  getMessages(conversationId: string, limit?: number): Promise<Message[]>;
  updateMessage(messageId: string, text: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  markMessageAsRead(messageId: string): Promise<void>;
  reactToMessage(messageId: string, userId: string, emoji: string): Promise<void>;

  // Notification Operations
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  createNotification(notification: Partial<Notification>): Promise<string>;
  markNotificationAsRead(notificationId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(notificationId: string): Promise<void>;

  // Highlight Operations
  getHighlight(highlightId: string): Promise<Highlight | null>;
  getUserHighlights(userId: string): Promise<Highlight[]>;
  createHighlight(highlight: Partial<Highlight>): Promise<string>;
  updateHighlight(highlightId: string, data: Partial<Highlight>): Promise<void>;
  deleteHighlight(highlightId: string): Promise<void>;

  // Live Stream Operations
  getLiveStream(streamId: string): Promise<LiveStream | null>;
  getActiveLiveStreams(): Promise<LiveStream[]>;
  createLiveStream(stream: Partial<LiveStream>): Promise<string>;
  updateLiveStream(streamId: string, data: Partial<LiveStream>): Promise<void>;
  endLiveStream(streamId: string): Promise<void>;
  joinLiveStream(streamId: string, userId: string): Promise<void>;
  leaveLiveStream(streamId: string, userId: string): Promise<void>;

  // Passport Operations
  getPassportEntries(userId: string): Promise<PassportEntry[]>;
  createPassportEntry(entry: Partial<PassportEntry>): Promise<string>;
  updatePassportEntry(entryId: string, data: Partial<PassportEntry>): Promise<void>;
  deletePassportEntry(entryId: string): Promise<void>;

  // Follow Operations
  followUser(followerId: string, followingId: string): Promise<void>;
  unfollowUser(followerId: string, followingId: string): Promise<void>;
  getFollowers(userId: string): Promise<User[]>;
  getFollowing(userId: string): Promise<User[]>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;

  // Real-time Subscriptions
  subscribeToUserUpdates(userId: string, callback: (user: User) => void): () => void;
  subscribeToMessages(conversationId: string, callback: (messages: Message[]) => void): () => void;
  subscribeToNotifications(userId: string, callback: (notifications: Notification[]) => void): () => void;
  subscribeToLiveStreams(callback: (streams: LiveStream[]) => void): () => void;
}

// ==================== AUTHENTICATION SERVICE ====================

export interface IAuthService {
  // Authentication
  signUp(email: string, password: string, userData: Partial<User>): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  signInWithGoogle(): Promise<User>;
  signInWithApple(): Promise<User>;
  
  // User Management
  getCurrentUser(): Promise<User | null>;
  updateProfile(data: Partial<User>): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  deleteAccount(): Promise<void>;
  
  // Session Management
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  refreshToken(): Promise<string>;
  isAuthenticated(): Promise<boolean>;
}

// ==================== STORAGE SERVICE ====================

export interface IStorageService {
  // Upload Operations
  uploadImage(uri: string, path: string): Promise<string>;
  uploadVideo(uri: string, path: string): Promise<string>;
  uploadFile(uri: string, path: string, mimeType: string): Promise<string>;
  
  // Download Operations
  getDownloadUrl(path: string): Promise<string>;
  
  // Delete Operations
  deleteFile(path: string): Promise<void>;
  
  // Batch Operations
  uploadMultipleImages(uris: string[], basePath: string): Promise<string[]>;
  deleteMultipleFiles(paths: string[]): Promise<void>;
}

// ==================== MAP SERVICE ====================

export interface IMapService {
  // Geocoding
  geocodeAddress(address: string): Promise<LocationData | null>;
  reverseGeocode(latitude: number, longitude: number): Promise<LocationData | null>;
  
  // Place Search
  searchPlaces(query: string): Promise<LocationData[]>;
  getPlaceDetails(placeId: string): Promise<LocationData | null>;
  
  // Distance & Directions
  calculateDistance(from: LocationData, to: LocationData): Promise<number>;
  getDirections(from: LocationData, to: LocationData): Promise<any>;
  
  // Map Configuration
  getApiKey(): string;
  getMapProvider(): 'google' | 'mapbox' | 'apple';
}

// ==================== STREAMING SERVICE ====================

export interface IStreamingService {
  // Stream Management
  initialize(): Promise<void>;
  createChannel(userId: string): Promise<string>;
  joinChannel(channelName: string, userId: string, isHost: boolean): Promise<void>;
  leaveChannel(): Promise<void>;
  
  // Token Management
  getToken(channelName: string, userId: string): Promise<string>;
  
  // Stream Controls
  muteAudio(): Promise<void>;
  unmuteAudio(): Promise<void>;
  enableVideo(): Promise<void>;
  disableVideo(): Promise<void>;
  switchCamera(): Promise<void>;
  
  // Configuration
  getAppId(): string;
  getProvider(): 'agora' | 'twilio' | 'aws-ivs';
}

// ==================== NOTIFICATION SERVICE ====================

export interface INotificationService {
  // Push Notifications
  requestPermission(): Promise<boolean>;
  getToken(): Promise<string>;
  sendNotification(userId: string, title: string, body: string, data?: any): Promise<void>;
  
  // Local Notifications
  scheduleLocalNotification(title: string, body: string, trigger: Date): Promise<string>;
  cancelLocalNotification(notificationId: string): Promise<void>;
  
  // Notification Handlers
  onNotificationReceived(callback: (notification: any) => void): () => void;
  onNotificationClicked(callback: (notification: any) => void): () => void;
}

// ==================== ANALYTICS SERVICE ====================

export interface IAnalyticsService {
  // Event Tracking
  logEvent(eventName: string, params?: Record<string, any>): Promise<void>;
  logScreenView(screenName: string): Promise<void>;
  
  // User Properties
  setUserId(userId: string): Promise<void>;
  setUserProperty(name: string, value: string): Promise<void>;
  
  // Custom Events
  logPostCreated(postId: string): Promise<void>;
  logPostLiked(postId: string): Promise<void>;
  logUserFollowed(userId: string): Promise<void>;
  logLiveStreamStarted(streamId: string): Promise<void>;
}

// ==================== CACHE SERVICE ====================

export interface ICacheService {
  // Cache Operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  
  // Bulk Operations
  getMultiple<T>(keys: string[]): Promise<(T | null)[]>;
  setMultiple<T>(items: { key: string; value: T; ttl?: number }[]): Promise<void>;
  deleteMultiple(keys: string[]): Promise<void>;
}

// ==================== ERROR HANDLING ====================

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class NetworkError extends ServiceError {
  constructor(message: string, details?: any) {
    super('NETWORK_ERROR', message, details);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends ServiceError {
  constructor(message: string, details?: any) {
    super('AUTH_ERROR', message, details);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

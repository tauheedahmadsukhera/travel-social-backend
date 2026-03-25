/**
 * TypeScript Interfaces for All Data Models
 * Centralized type definitions for the entire app
 */

type Timestamp = Date;

// ==================== USER MODELS ====================

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  coverPhoto?: string;
  isPrivate: boolean;
  isVerified: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  location?: LocationData;
  website?: string;
  phoneNumber?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  dateOfBirth?: Date;
  pushToken?: string;
  lastSeen?: Timestamp | Date;
  isOnline?: boolean;
}

export interface UserProfile extends User {
  highlights?: Highlight[];
  passport?: PassportEntry[];
  savedPosts?: string[];
}

export interface UserStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  highlightsCount: number;
  countriesVisited: number;
}

// ==================== POST MODELS ====================

export interface Post {
  id: string;
  userId: string;
  username: string;
  userAvatar?: string;
  caption: string;
  images: string[];
  location?: LocationData;
  likes: string[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  isArchived?: boolean;
  tags?: string[];
  mentions?: string[];
}

export interface PostWithUser extends Post {
  user: User;
}

// ==================== STORY MODELS ====================

export interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  views: string[];
  viewsCount: number;
  createdAt: Timestamp | Date;
  expiresAt: Timestamp | Date;
  location?: LocationData;
  isActive: boolean;
}

export interface StoryGroup {
  userId: string;
  username: string;
  userAvatar?: string;
  stories: Story[];
  hasUnseenStories: boolean;
  latestStory: Story;
}

// ==================== HIGHLIGHT MODELS ====================

export interface Highlight {
  id: string;
  userId: string;
  title: string;
  coverImage: string;
  storyIds: string[];
  stories?: Story[];
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// ==================== COMMENT MODELS ====================

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userAvatar?: string;
  text: string;
  likes: string[];
  likesCount: number;
  replyCount: number;
  parentCommentId?: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// ==================== MESSAGE MODELS ====================

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  isRead: boolean;
  reactions?: MessageReaction[];
  replyTo?: MessageReply;
  isEdited?: boolean;
  isDeleted?: boolean;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
}

export interface MessageReaction {
  userId: string;
  emoji: string;
  createdAt: Timestamp | Date;
}

export interface MessageReply {
  messageId: string;
  text: string;
  senderId: string;
  senderUsername: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  participantData?: {
    [userId: string]: {
      username: string;
      avatar?: string;
      lastSeen?: Timestamp | Date;
      isOnline?: boolean;
    };
  };
  lastMessage?: string;
  lastMessageAt?: Timestamp | Date;
  lastMessageSenderId?: string;
  unreadCount?: {
    [userId: string]: number;
  };
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// ==================== NOTIFICATION MODELS ====================

export interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'message' | 'live-stream';
  postId?: string;
  postImage?: string;
  commentId?: string;
  message?: string;
  isRead: boolean;
  createdAt: Timestamp | Date;
}

// ==================== LIVE STREAM MODELS ====================

export interface LiveStream {
  id: string;
  hostId: string;
  hostUsername: string;
  hostAvatar?: string;
  channelName: string;
  title: string;
  description?: string;
  viewersCount: number;
  viewers: string[];
  isActive: boolean;
  startedAt: Timestamp | Date;
  endedAt?: Timestamp | Date;
  duration?: number;
  location?: LocationData;
  thumbnail?: string;
}

export interface LiveStreamComment {
  id: string;
  streamId: string;
  userId: string;
  username: string;
  userAvatar?: string;
  text: string;
  createdAt: Timestamp | Date;
}

// ==================== PASSPORT MODELS ====================

export interface PassportEntry {
  id: string;
  userId: string;
  country: string;
  countryCode: string;
  city?: string;
  visitDate: Date;
  photos: string[];
  notes?: string;
  location?: LocationData;
  createdAt: Timestamp | Date;
}

// ==================== LOCATION MODELS ====================

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  placeId?: string;
  placeName?: string;
}

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// ==================== FOLLOW MODELS ====================

export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Timestamp | Date;
}

export interface FollowRequest {
  id: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp | Date;
  respondedAt?: Timestamp | Date;
}

// ==================== SEARCH MODELS ====================

export interface SearchResult {
  users: User[];
  posts: Post[];
  locations: LocationData[];
  tags: string[];
}

// ==================== ANALYTICS MODELS ====================

export interface PostAnalytics {
  postId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  engagement: number;
}

export interface UserAnalytics {
  userId: string;
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  followersGrowth: number;
  engagementRate: number;
}

// ==================== API RESPONSE MODELS ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ==================== FORM MODELS ====================

export interface LoginForm {
  email: string;
  password: string;
}

export interface SignupForm {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export interface EditProfileForm {
  displayName?: string;
  bio?: string;
  avatar?: string;
  coverPhoto?: string;
  website?: string;
  phoneNumber?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  isPrivate?: boolean;
}

export interface CreatePostForm {
  caption: string;
  images: string[];
  location?: LocationData;
  tags?: string[];
  mentions?: string[];
}

// ==================== ERROR MODELS ====================

export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

// ==================== HELPER TYPES ====================

export type UserRole = 'user' | 'admin' | 'moderator';
export type MediaType = 'image' | 'video' | 'audio';
export type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'message' | 'live-stream';
export type PostVisibility = 'public' | 'private' | 'followers';
export type StreamStatus = 'live' | 'ended' | 'scheduled';

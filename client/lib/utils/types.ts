/**
 * Global Type Definitions for Trave Social
 */

export interface User {
  id: string;
  _id?: string;
  uid?: string;
  username: string;
  displayName?: string;
  name?: string;
  avatar?: string;
  photoURL?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  isPrivate?: boolean;
  isApprovedFollower?: boolean;
}

export interface Post {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video';
  caption?: string;
  location?: string | { lat: number; lon: number; name?: string };
  lat?: number;
  lon?: number;
  likesCount?: number;
  commentsCount?: number;
  createdAt: string | number | Date;
  updatedAt?: string;
  isLive?: boolean;
}

export interface Story {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  views?: string[];
  likes?: string[];
  comments?: StoryComment[];
  isPostShare?: boolean;
  postMetadata?: {
    postId: string;
    userName: string;
    userAvatar: string;
    caption?: string;
    imageUrl?: string;
  };
}

export interface StoryComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: any;
  replies?: StoryComment[];
  likes?: string[];
  likesCount?: number;
  editedAt?: any;
}

export interface Comment {
  id: string;
  text: string;
  userAvatar: string;
  userName: string;
  userId: string;
  createdAt?: any;
  editedAt?: any;
  replies?: Comment[];
  reactions?: { [userId: string]: string };
  likes?: string[];
  likesCount?: number;
  isReply?: boolean;
  parentId?: string;
}

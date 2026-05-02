# 📘 Trave Social API Specification

This document provides a summary of the available API endpoints in the Trave Social backend.

## 🔑 Authentication
- **POST** `/api/users/login` - Authenticate user and return session.
- **POST** `/api/users/register` - Create a new user account.
- **POST** `/api/users/logout` - Invalidate current session.

## 📰 Post Feed & Discovery
- **GET** `/api/posts/feed` - Returns a personalized feed of posts based on visibility settings.
    - Query params: `limit`, `skip`, `viewerId`.
- **GET** `/api/posts/recommended` - Returns a random selection of public posts for discovery.
- **GET** `/api/posts/:postId` - Get details for a single post.

## 👤 User Management
- **GET** `/api/users/profile/:userId` - Get public profile data.
- **PATCH** `/api/users/profile` - Update current user profile.
- **GET** `/api/users/search` - Search for users by name or username.

## 📸 Stories
- **GET** `/api/stories` - Get active stories from followed users.
- **POST** `/api/stories` - Upload a new story.
- **DELETE** `/api/stories/:storyId` - Remove a story.

## 💬 Messaging & Real-time
- **GET** `/api/conversations` - List active chat conversations.
- **GET** `/api/messages/:convoId` - Fetch message history for a conversation.
- **Socket.io** - Real-time events for `newMessage`, `typing`, and `userStatus`.

## 🛡️ Admin & Moderation
- **GET** `/api/admin/stats` - System-wide statistics for the dashboard.
- **POST** `/api/moderation/report` - Report a post or user.

---
*Note: All requests should include `userid` in headers for visibility filtering where applicable.*

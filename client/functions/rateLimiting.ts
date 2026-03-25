/**
 * Firebase Cloud Functions for Server-Side Rate Limiting
 * Deploy with: firebase deploy --only functions
 * 
 * NOTE: This file is for Firebase Cloud Functions environment only.
 * It will have TypeScript errors in the main app editor since 
 * firebase-admin and firebase-functions are Cloud Functions dependencies.
 * 
 * Install in functions/ directory:
 * cd functions
 * npm install firebase-admin firebase-functions
 * 
 * These errors are normal and will resolve when deployed to Firebase.
 */

// @ts-ignore - These are Cloud Functions dependencies, not available in app
import * as functions from 'firebase-functions';
import { onSchedule, ScheduledEvent } from 'firebase-functions/v2/scheduler';
// @ts-ignore
import * as admin from 'firebase-admin';

// @ts-ignore
const db = admin.firestore();
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

interface RateLimitConfig {
  action: string;
  maxPerWindow: number;
  windowSeconds: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'create-post': { action: 'post', maxPerWindow: 20, windowSeconds: 3600 },
  'send-comment': { action: 'comment', maxPerWindow: 100, windowSeconds: 3600 },
  'send-message': { action: 'message', maxPerWindow: 300, windowSeconds: 60 },
  'like-post': { action: 'like', maxPerWindow: 1000, windowSeconds: 3600 },
  'follow-user': { action: 'follow', maxPerWindow: 50, windowSeconds: 3600 },
  'report-content': { action: 'report', maxPerWindow: 10, windowSeconds: 3600 },
};

/**
 * Check rate limit for user action
 * Returns { allowed: boolean, remaining: number, resetAt: Date }
 */
export const checkRateLimit = functions.https.onCall(
  // @ts-ignore
  async (data: { action: string; userId: string }, context: any) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User not authenticated'
        );
      }

      const { action, userId } = data;
      const config = RATE_LIMITS[action];

      if (!config) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Unknown action: ${action}`
        );
      }

      // Security: User can only check their own rate limit
      if (userId !== context.auth.uid) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot check other user rate limits'
        );
      }

      const rateLimitRef = db
        .collection('rateLimits')
        .doc(userId)
        .collection('actions')
        .doc(action);

      const doc = await rateLimitRef.get();
      const now = Math.floor(Date.now() / 1000);

      if (!doc.exists) {
        // First request - create entry
        await rateLimitRef.set({
          count: 1,
          windowStart: now,
          lastReset: now,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          allowed: true,
          remaining: config.maxPerWindow - 1,
          resetAt: new Date(now * 1000 + config.windowSeconds * 1000),
          message: 'Rate limit check passed',
        };
      }

      const data_temp = doc.data();
      const windowStart = data_temp?.windowStart || now;
      const count = data_temp?.count || 0;
      const elapsed = now - windowStart;

      if (elapsed >= config.windowSeconds) {
        // Window expired - reset
        await rateLimitRef.update({
          count: 1,
          windowStart: now,
          lastReset: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          allowed: true,
          remaining: config.maxPerWindow - 1,
          resetAt: new Date(now * 1000 + config.windowSeconds * 1000),
          message: 'Window reset, request allowed',
        };
      }

      // Still in window - check if limit exceeded
      if (count >= config.maxPerWindow) {
        const resetTime = new Date((windowStart + config.windowSeconds) * 1000);
        throw new functions.https.HttpsError(
          'resource-exhausted',
          `Rate limit exceeded for ${action}. Try again at ${resetTime.toISOString()}`,
          {
            remaining: 0,
            resetAt: resetTime,
            action,
          }
        );
      }

      // Increment count
      await rateLimitRef.update({
        count: admin.firestore.FieldValue.increment(1),
        lastReset: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        allowed: true,
        remaining: config.maxPerWindow - (count + 1),
        resetAt: new Date((windowStart + config.windowSeconds) * 1000),
        message: 'Rate limit check passed',
      };
    } catch (error: any) {
      console.error('Rate limit error:', error);
      if (error.code?.startsWith('permission-denied') || error.code?.startsWith('unauthenticated')) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Rate limit check failed');
    }
  }
);

/**
 * Cleanup old rate limit entries (runs daily)
 */
export const cleanupRateLimits = onSchedule('every 24 hours', async (event: ScheduledEvent): Promise<void> => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const cutoffTime = now - 86400; // 24 hours ago

      const snapshot = await db
        .collectionGroup('actions')
        .where('lastReset', '<', cutoffTime)
        .get();

      let deleted = 0;
      const batch = db.batch();

      snapshot.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
        deleted++;
      });

      if (deleted > 0) {
        await batch.commit();
        console.log(`✅ Cleaned up ${deleted} expired rate limit entries`);
      }

      // Just log, don't return anything
      return;
    } catch (error) {
      console.error('Cleanup error:', error);
      // Just log error, don't return anything
      return;
    }
  });

/**
 * Reset user's rate limit for specific action (admin only)
 */
export const resetRateLimitAdmin = functions.https.onCall(
  // @ts-ignore
  async (data: { userId: string; action: string }, context: any) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User not authenticated'
        );
      }

      // Check if user is admin
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      const userData = userDoc.data();

      if (!userData?.isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can reset rate limits'
        );
      }

      const { userId, action } = data;

      await db
        .collection('rateLimits')
        .doc(userId)
        .collection('actions')
        .doc(action)
        .delete();

      return {
        success: true,
        message: `Rate limit reset for ${userId}/${action}`,
      };
    } catch (error: any) {
      console.error('Reset error:', error);
      throw error;
    }
  }
);

/**
 * Get rate limit stats for user (for debugging)
 */
export const getRateLimitStats = functions.https.onCall(
  // @ts-ignore
  async (data: { userId: string }, context: any) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User not authenticated'
        );
      }

      const { userId } = data;

      // User can only view their own stats
      if (userId !== context.auth.uid) {
        const userData = await db.collection('users').doc(context.auth.uid).get();
        if (!userData.data()?.isAdmin) {
          throw new functions.https.HttpsError(
            'permission-denied',
            'Cannot view other user stats'
          );
        }
      }

      const snapshot = await db
        .collection('rateLimits')
        .doc(userId)
        .collection('actions')
        .get();

      const stats: Record<string, any> = {};
      const now = Math.floor(Date.now() / 1000);

      snapshot.docs.forEach((doc: any) => {
        const action = doc.id;
        const data_temp = doc.data();
        const config = RATE_LIMITS[action];
        const windowStart = data_temp.windowStart || 0;
        const count = data_temp.count || 0;
        const elapsed = now - windowStart;

        stats[action] = {
          count,
          remaining: Math.max(0, (config?.maxPerWindow || 0) - count),
          windowExpired: elapsed >= (config?.windowSeconds || 3600),
          resetAt: new Date((windowStart + (config?.windowSeconds || 3600)) * 1000),
        };
      });

      return { stats, userId };
    } catch (error: any) {
      console.error('Stats error:', error);
      throw error;
    }
  }
);

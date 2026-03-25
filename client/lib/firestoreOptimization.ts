/**
 * Firestore Query Optimization
 * Prevents N+1 queries, adds batching, indexing hints
 */

import { collection, query as firestoreQuery, getDocs, limit, onSnapshot, orderBy, QueryConstraint, where } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Batch fetch multiple documents efficiently (avoids N+1)
 * @param collectionName - Firestore collection name
 * @param constraints - Query constraints (where, orderBy, limit, etc.)
 * @returns Array of documents with IDs
 */
export async function batchQueryDocs(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  maxDocs: number = 100
) {
  try {
    const coll = collection(db, collectionName);
    const q = firestoreQuery(coll, ...constraints, limit(maxDocs));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error(`❌ Error batch querying ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Real-time listener with batching (for followers, comments, etc.)
 * Use WHERE + LIMIT to avoid large collection scans
 */
export function batchListenDocs(
  collectionName: string,
  constraints: QueryConstraint[],
  onData: (docs: any[]) => void,
  onError?: (error: any) => void
) {
  try {
    const coll = collection(db, collectionName);
    const q = firestoreQuery(coll, ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      onData(docs);
    }, (error) => {
      console.error(`❌ Error listening to ${collectionName}:`, error);
      onError?.(error);
    });

    return unsubscribe;
  } catch (error) {
    console.error(`❌ Error setting up listener for ${collectionName}:`, error);
    onError?.(error);
    return () => {};
  }
}

/**
 * Efficient follower list fetch (with pagination to avoid N+1)
 * Instead of fetching all, use pagination
 */
export async function getFollowersPaginated(
  userId: string,
  pageSize: number = 50,
  startAfter?: string
) {
  try {
    const constraints: QueryConstraint[] = [
      where('followingId', '==', userId),
      orderBy('followedAt', 'desc'),
      limit(pageSize + 1), // +1 to check if there's a next page
    ];

    if (startAfter) {
      // Would need to implement proper pagination cursor here
      // For now, this is a template
    }

    const followers = await batchQueryDocs('follows', constraints, pageSize);

    return {
      data: followers.slice(0, pageSize),
      hasMore: followers.length > pageSize,
    };
  } catch (error) {
    console.error('❌ Error fetching followers:', error);
    throw error;
  }
}

/**
 * Efficient post feed fetch with proper indexing hints
 * Uses collection group queries when needed
 */
export async function getPostsFeed(
  userId: string,
  pageSize: number = 20,
  lastVisible?: any
) {
  try {
    // This assumes a proper structure; adjust for your schema
    // Use collection groups if posts are nested under users
    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
      limit(pageSize + 1),
    ];

    // Firestore indexes required for complex queries:
    // Collection: posts | Fields: createdAt (desc) + userId (asc) + isLive (asc)
    // This is handled in firestore.indexes.json

    const posts = await batchQueryDocs('posts', constraints, pageSize);

    return {
      data: posts.slice(0, pageSize),
      hasMore: posts.length > pageSize,
      lastVisible: posts[pageSize - 1]?.id,
    };
  } catch (error) {
    console.error('❌ Error fetching feed:', error);
    throw error;
  }
}

/**
 * Suggest Firestore indexes to create (log these in console)
 * Run these in Firebase console to improve query performance
 */
export const RECOMMENDED_INDEXES = {
  posts: [
    'createdAt (Desc) + userId (Asc) + isLive (Asc)',
    'likesCount (Desc) + createdAt (Desc)',
    'location.lat (Asc) + location.lon (Asc) + createdAt (Desc)',
  ],
  follows: ['followingId (Asc) + followedAt (Desc)', 'followerId (Asc) + followedAt (Desc)'],
  comments: [
    'postId (Asc) + createdAt (Desc)',
    'userId (Asc) + createdAt (Desc)',
  ],
  liveStreams: [
    'isLive (Asc) + createdAt (Desc)',
    'hostId (Asc) + createdAt (Desc)',
  ],
};

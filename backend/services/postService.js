const mongoose = require('mongoose');

/**
 * Optimized Aggregation Pipeline for Posts
 * Handles:
 * 1. Visibility filtering
 * 2. Sorting & Pagination
 * 3. Author data lookup
 * 4. Like status for viewer
 * 5. Saved status for viewer
 * 6. Comment count lookup
 */
async function getEnrichedPosts(query, { skip = 0, limit = 20, sort = { createdAt: -1 }, viewerId = null }) {
  const Post = mongoose.model('Post');
  const viewerVariants = [];
  
  if (viewerId) {
    try {
      const { resolveUserIdentifiers } = require('../src/utils/userUtils');
      const { candidates } = await resolveUserIdentifiers(viewerId);
      candidates.forEach(id => viewerVariants.push(String(id)));
    } catch (e) {
      viewerVariants.push(String(viewerId));
    }
  }

  const pipeline = [
    { $match: query },
    { $sort: sort },
    { $skip: skip },
    { $limit: limit },
    // 1. Author Lookup
    {
      $lookup: {
        from: 'users',
        let: { authorId: '$userId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ['$_id', '$$authorId'] },
                  { $eq: ['$firebaseUid', '$$authorId'] },
                  { $eq: ['$uid', '$$authorId'] }
                ]
              }
            }
          },
          { $project: { displayName: 1, name: 1, avatar: 1, profilePicture: 1, photoURL: 1, isPrivate: 1 } }
        ],
        as: 'author'
      }
    },
    { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
    // 2. Comment Count Lookup
    {
      $lookup: {
        from: 'comments',
        localField: '_id',
        foreignField: 'postId',
        as: 'commentsList'
      }
    },
    // 3. Saved Status Lookup
    {
      $lookup: {
        from: 'savedposts',
        let: { pid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$postId', '$$pid'] },
                  { $in: ['$userId', viewerVariants] }
                ]
              }
            }
          }
        ],
        as: 'savedStatus'
      }
    },
    // 4. Transform and Add Fields
    {
      $addFields: {
        isLiked: {
          $cond: {
            if: { $and: [ { $gt: [viewerVariants.length, 0] }, { $isArray: "$likes" } ] },
            then: { $gt: [ { $size: { $setIntersection: ["$likes", viewerVariants] } }, 0 ] },
            else: false
          }
        },
        isSaved: { $gt: [{ $size: '$savedStatus' }, 0] },
        commentCount: { $add: [{ $size: '$commentsList' }, { $ifNull: ["$commentsCount", 0] }] },
        // Structured user object for frontend compatibility
        userId: {
          $ifNull: [
            "$author",
            { _id: "$userId", displayName: "User", name: "User", avatar: null }
          ]
        }
      }
    },
    { $project: { commentsList: 0, savedStatus: 0, author: 0 } }
  ];

  const posts = await Post.aggregate(pipeline);
  
  // Final pass in JS for complex formatting (media URLs, etc.)
  const { enrichPostsWithUserData } = require('../utils/postHelpers');
  return await enrichPostsWithUserData(posts, viewerId);
}

module.exports = {
  getEnrichedPosts
};

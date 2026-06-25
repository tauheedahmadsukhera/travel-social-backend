const mongoose = require('mongoose');

/**
 * Optimized Feed Aggregation Pipeline
 * This replaces multiple queries (Post, User, Comment, SavedPost) with a single DB roundtrip.
 */
async function getOptimizedFeed(viewerId, limit = 20, skip = 0) {
  const Post = mongoose.model('Post');
  const viewerVariants = viewerId ? [new mongoose.Types.ObjectId(viewerId)] : [];
  
  // Note: For simplicity in this example, we assume viewerId is a valid ObjectId.
  // In a real scenario, we'd use resolveUserIdentifiers to get all variants.
  
  const pipeline = [
    // 1. Initial Match (Public posts or from followed users - simplified for example)
    // In a full implementation, we'd include follows logic here or pass followingIds
    { $match: { isPrivate: { $ne: true } } }, 
    
    // 2. Sort by creation
    { $sort: { createdAt: -1 } },
    
    // 3. Pagination
    { $skip: skip },
    { $limit: limit },
    
    // 4. Lookup Author details
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'authorInfo'
      }
    },
    { $unwind: { path: '$authorInfo', preserveNullAndEmptyArrays: true } },
    
    // 5. Lookup Comment count from standalone collection
    {
      $lookup: {
        from: 'comments',
        let: { postId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
          { $count: 'count' }
        ],
        as: 'commentData'
      }
    },
    
    // 6. Lookup Saved status
    {
      $lookup: {
        from: 'savedposts',
        let: { postId: '$_id' },
        pipeline: [
          { 
            $match: { 
              $expr: { 
                $and: [
                  { $eq: ['$postId', '$$postId'] },
                  { $in: ['$userId', viewerVariants] }
                ]
              } 
            } 
          },
          { $limit: 1 }
        ],
        as: 'savedStatus'
      }
    },
    
    // 7. Project final shape
    {
      $project: {
        _id: 1,
        text: 1,
        content: 1,
        media: 1,
        mediaUrls: 1,
        location: 1,
        createdAt: 1,
        likesCount: 1,
        likes: 1,
        commentCount: { 
          $add: [
            { $ifNull: [{ $arrayElemAt: ['$commentData.count', 0] }, 0] },
            { $size: { $ifNull: ['$comments', []] } } // Include legacy inline comments
          ]
        },
        isSaved: { $gt: [{ $size: '$savedStatus' }, 0] },
        author: {
          _id: '$authorInfo._id',
          displayName: '$authorInfo.displayName',
          avatar: '$authorInfo.avatar',
          isPrivate: '$authorInfo.isPrivate'
        }
      }
    }
  ];

  return await Post.aggregate(pipeline);
}

module.exports = { getOptimizedFeed };

const mongoose = require('mongoose');
const Story = require('../src/models/Story');

async function test() {
  await mongoose.connect('mongodb+srv://tauheedahmadsukhera:w8TIfbXNl1P7oDq8@cluster0.st1rogr.mongodb.net/trave-social?retryWrites=true&w=majority');
  console.log('Connected to DB');
  
  const requesterUserId = 'dummy_id';
  const pipeline = [
      { $match: { expiresAt: { $gt: new Date() } } },
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
      // 1. Join with Users collection to get author details and privacy status
      {
        $lookup: {
          from: 'users',
          let: { storyAuthorId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$firebaseUid', '$$storyAuthorId'] },
                    { $eq: ['$uid', '$$storyAuthorId'] },
                    { $eq: [{ $toString: '$_id' }, '$$storyAuthorId'] }
                  ]
                }
              }
            },
            { $project: { displayName: 1, name: 1, avatar: 1, photoURL: 1, profilePicture: 1, isPrivate: 1 } }
          ],
          as: 'author'
        }
      },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      
      // 2. Join with Follows collection IF requesterUserId is provided
      ...(requesterUserId ? [
        {
          $lookup: {
            from: 'follows',
            let: { authorId: '$userId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$followerId', requesterUserId] },
                      { $eq: ['$followingId', '$$authorId'] }
                    ]
                  }
                }
              }
            ],
            as: 'followStatus'
          }
        },
        { $addFields: { isFollowing: { $gt: [{ $size: '$followStatus' }, 0] } } }
      ] : [
        { $addFields: { isFollowing: false } }
      ]),

      // 3. Privacy Filtering Logic
      {
        $match: {
          $or: [
            { 'author.isPrivate': { $ne: true } }, // Author is public
            { userId: requesterUserId },           // Own story
            { isFollowing: true }                  // Requester follows author
          ]
        }
      },

      // 4. Format final output
      {
        $project: {
          followStatus: 0,
          isFollowing: 0,
          // Map author fields to flat structure for backward compatibility
          userName: { $ifNull: ['$author.displayName', { $ifNull: ['$author.name', { $ifNull: ['$userName', 'Anonymous'] }] }] },
          userAvatar: { $ifNull: ['$author.avatar', { $ifNull: ['$author.photoURL', { $ifNull: ['$author.profilePicture', '$userAvatar'] }] }] },
          author: 0
        }
      }
    ];

    try {
      const stories = await Story.aggregate(pipeline);
      console.log('Success!', stories.length);
    } catch(e) {
      console.error('Error:', e);
    }
    process.exit(0);
}
test();

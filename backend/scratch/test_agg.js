require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Story = require('../src/models/Story');

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');
    
    const limit = 50;
    const requesterUserId = '123';
    
    const pipeline = [
      { $match: { expiresAt: { $gt: new Date() } } },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
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

      {
        $match: {
          $or: [
            { 'author.isPrivate': { $ne: true } },
            { userId: requesterUserId },
            { isFollowing: true }
          ]
        }
      },

      {
        $addFields: {
          userName: { $ifNull: ['$author.displayName', { $ifNull: ['$author.name', { $ifNull: ['$userName', 'Anonymous'] }] }] },
          userAvatar: { $ifNull: ['$author.avatar', { $ifNull: ['$author.photoURL', { $ifNull: ['$author.profilePicture', '$userAvatar'] }] }] },
        }
      },
      {
        $unset: ['followStatus', 'isFollowing', 'author']
      }
    ];

    const stories = await Story.aggregate(pipeline);
    console.log('Success! Found stories:', stories.length);
  } catch(e) {
    console.error('Error during aggregation:', e);
  }
  process.exit(0);
}
test();

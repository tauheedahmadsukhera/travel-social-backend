const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

// Models
const User = require('../src/models/User');
const Post = require('../src/models/Post');
const Follow = require('../src/models/Follow');
const Passport = require('../src/models/Passport');
const Comment = require('../src/models/Comment');

const MONGO_URI = process.env.MONGO_URI;

const GENERIC_COMMENTS = [
  "Wow, this looks amazing! 😍",
  "Great shot! 📸",
  "I need to visit this place too!",
  "Absolutely beautiful.",
  "Travel goals! ✨",
  "Nice view!",
  "Keep exploring! 🌍",
  "This is so cool.",
  "Love the vibes here.",
  "Fantastic capture!",
  "So jealous right now haha",
  "Wonderful!",
  "The lighting is perfect.",
  "Best place ever!",
  "Can't wait for my next trip after seeing this.",
  "Pure magic!",
  "Incredible perspective.",
  "Adding this to my bucket list! 📝"
];

const EMOJIS = ['❤️', '🔥', '🙌', '😍', '👏', '✨', '🌍', '📍'];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[arr[j]]] = [arr[j], arr[i]]; // Wait, this shuffle was slightly broken in my previous one (array[arr[j]])
  }
  return arr;
}

// Correct shuffle
function realShuffle(array) {
    let currentIndex = array.length,  randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
    return array;
}

async function enrich() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const fakeUsers = await User.find({ uid: { $regex: '^fake_' } });
    console.log(`Found ${fakeUsers.length} fake users.`);

    const fakePosts = await Post.find({ userId: { $regex: '^fake_' } });
    console.log(`Found ${fakePosts.length} fake posts.`);

    // 1. Follow Relationships
    console.log('\nGenerating follow relationships...');
    for (const user of fakeUsers) {
      const others = fakeUsers.filter(u => u.uid !== user.uid);
      const followCount = Math.floor(Math.random() * 15) + 10; // 10 to 25 follows
      const toFollow = realShuffle([...others]).slice(0, followCount);

      for (const target of toFollow) {
        try {
          await Follow.findOneAndUpdate(
            { followerId: user.uid, followingId: target.uid },
            { followerId: user.uid, followingId: target.uid },
            { upsert: true }
          );
        } catch (e) {}
      }

      const followingCount = await Follow.countDocuments({ followerId: user.uid });
      const followersCount = await Follow.countDocuments({ followingId: user.uid });
      
      await User.findOneAndUpdate(
        { uid: user.uid },
        { $set: { followingCount, followersCount } }
      );
    }
    console.log('Follows updated.');

    // 2. Engagement
    console.log('\nGenerating engagement for posts...');
    for (const post of fakePosts) {
      const others = realShuffle([...fakeUsers]).filter(u => u.uid !== post.userId);
      
      const likeCount = Math.floor(Math.random() * 15) + 5;
      const likers = others.slice(0, likeCount).map(u => u.uid);
      
      const commentCount = Math.floor(Math.random() * 4) + 2;
      const commenters = others.slice(likeCount, likeCount + commentCount);
      const postComments = [];

      for (const commenter of commenters) {
          const content = GENERIC_COMMENTS[Math.floor(Math.random() * GENERIC_COMMENTS.length)];
          const comment = await Comment.findOneAndUpdate(
              { postId: post._id, userId: commenter.uid },
              {
                  $set: {
                      postId: post._id,
                      userId: commenter.uid,
                      userName: commenter.username,
                      userAvatar: commenter.avatar,
                      text: content,
                      createdAt: new Date(post.createdAt.getTime() + Math.random() * 24 * 60 * 60 * 1000)
                  }
              },
              { upsert: true, new: true }
          );
          postComments.push({
              commentId: comment._id.toString(),
              userId: commenter.uid,
              userName: commenter.username,
              userAvatar: commenter.avatar,
              content: content,
              createdAt: comment.createdAt
          });
      }

      const reactionCount = Math.floor(Math.random() * 3) + 1;
      const reactioners = others.slice(likeCount + commentCount, likeCount + commentCount + reactionCount);
      const postReactions = reactioners.map(u => ({
          userId: u.uid,
          userName: u.username,
          userAvatar: u.avatar,
          emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
          createdAt: new Date(post.createdAt.getTime() + Math.random() * 12 * 60 * 60 * 1000)
      }));

      await Post.findByIdAndUpdate(post._id, {
          $set: {
              likes: likers,
              likesCount: likers.length,
              comments: postComments,
              commentsCount: postComments.length,
              commentCount: postComments.length,
              reactions: postReactions
          }
      });
    }
    console.log('Engagement updated.');

    // 3. Passport Stamps
    console.log('\nGenerating passport stamps...');
    for (const user of fakeUsers) {
      const userPosts = fakePosts.filter(p => p.userId === user.uid);
      const passportData = {
          userId: user.uid,
          stamps: [],
          ticketCount: userPosts.length,
          lastVisitedCountry: null,
          createdAt: user.createdAt
      };

      const countryStamps = {};

      for (const post of userPosts) {
          let country = post.category;
          if (post.location && post.location.includes(',')) {
              const parts = post.location.split(',');
              country = parts[parts.length - 1].trim();
          }

          if (!countryStamps[country]) {
              countryStamps[country] = {
                  type: 'country',
                  name: country,
                  count: 0,
                  visitHistory: [],
                  createdAt: post.createdAt
              };
          }
          countryStamps[country].count++;
          countryStamps[country].visitHistory.push({
              visitedAt: post.createdAt,
              lat: post.locationData ? post.locationData.lat : null,
              lon: post.locationData ? post.locationData.lon : null
          });
          passportData.lastVisitedCountry = country;
      }

      passportData.stamps = Object.values(countryStamps);

      await Passport.findOneAndUpdate(
          { userId: user.uid },
          { $set: passportData },
          { upsert: true, new: true }
      );
    }
    console.log('Passports updated.');

    console.log('\nEnrichment complete!');
    process.exit(0);
  } catch (err) {
    console.error('Enrichment failed:', err);
    process.exit(1);
  }
}

enrich();

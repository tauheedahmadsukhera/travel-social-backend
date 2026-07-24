const mongoose = require('mongoose');
require('dotenv').config();
const Post = require('../src/models/Post');
const User = require('../src/models/User');

async function checkStatus() {
  await mongoose.connect(process.env.MONGO_URI);
  const postCount = await Post.countDocuments({ userId: { $regex: '^fake_' } });
  const userCount = await User.countDocuments({ uid: { $regex: '^fake_' } });
  console.log(`Fake Users: ${userCount}`);
  console.log(`Fake Posts: ${postCount}`);
  process.exit(0);
}
checkStatus();

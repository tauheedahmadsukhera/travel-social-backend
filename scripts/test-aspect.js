require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const Post = mongoose.connection.collection('posts');
  const count = await Post.countDocuments({ aspectRatio: { $exists: true } });
  const total = await Post.countDocuments();
  console.log('Posts with aspectRatio:', count, 'Total:', total);

  mongoose.disconnect();
}
test().catch(console.error);

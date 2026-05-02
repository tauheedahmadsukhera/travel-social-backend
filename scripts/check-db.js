const mongoose = require('mongoose');
const Post = require('./models/Post');

async function checkLikes() {
  const uri = "mongodb://martin:martinadmin@ac-qemnb5t-shard-00-00.st1rogr.mongodb.net:27017,ac-qemnb5t-shard-00-01.st1rogr.mongodb.net:27017,ac-qemnb5t-shard-00-02.st1rogr.mongodb.net:27017/travesocial?ssl=true&replicaSet=atlas-13h75w-shard-0&authSource=admin&retryWrites=true&w=majority";
  try {
    await mongoose.connect(uri);
    const post = await Post.findOne({ likes: { $exists: true, $not: { $size: 0 } } });
    if (!post) {
      console.log('No posts with likes found.');
      const anyPost = await Post.findOne();
      console.log('Sample post:', JSON.stringify(anyPost, null, 2));
    } else {
      console.log('Post with likes found:', post._id);
      console.log('Likes array:', JSON.stringify(post.likes, null, 2));
      console.log('LikesCount:', post.likesCount);
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkLikes();

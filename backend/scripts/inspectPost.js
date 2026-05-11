const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('✅ Connected to MongoDB');
    require('../models/Post');
    const Post = mongoose.model('Post');
    
    const post = await Post.findOne({ likes: { $exists: true, $not: { $size: 0 } } });
    if (!post) {
        console.log('❌ No posts with likes found to inspect.');
    } else {
        console.log('Post ID:', post._id);
        console.log('Likes Array (Raw):', JSON.stringify(post.likes, null, 2));
        console.log('Likes Array Types:', post.likes.map(l => typeof l));
    }
    
    mongoose.connection.close();
});

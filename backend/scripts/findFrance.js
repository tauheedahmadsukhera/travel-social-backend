const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI).then(async () => {
    const Post = mongoose.model('Post', new mongoose.Schema({}, { strict: false }));
    const posts = await Post.find({
      $or: [
        { location: /france/i },
        { location: /paris/i },
        { 'locationData.address': /france/i },
        { 'locationData.address': /paris/i },
        { locationKeys: /france/i },
        { locationKeys: /paris/i }
      ]
    });
    console.log(JSON.stringify(posts.map(p => ({
      id: p._id,
      loc: p.location,
      addr: p.locationData?.address,
      keys: p.locationKeys
    })), null, 2));
    process.exit(0);
});

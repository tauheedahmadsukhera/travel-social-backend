const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI).then(async () => {
    const Post = mongoose.model('Post', new mongoose.Schema({}, { strict: false }));
    const posts = await Post.find({
      $or: [
        { location: /hawa/i },
        { locationName: /hawa/i },
        { 'locationData.name': /hawa/i },
        { 'locationData.address': /hawa/i },
        { locationKeys: /hawa/i }
      ]
    });
    console.log(JSON.stringify(posts.map(p => ({
      id: p._id,
      name: p.locationName,
      loc: p.location,
      addr: p.locationData?.address,
      keys: p.locationKeys
    })), null, 2));
    process.exit(0);
});

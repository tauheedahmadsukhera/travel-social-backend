require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');

async function getRatio(url) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || (!url.startsWith('http') && !url.startsWith('https'))) {
      resolve(1);
      return;
    }
    
    // Cloudinary URLs can have fl_getInfo to get JSON metadata
    if (url.includes('cloudinary.com')) {
      const parts = url.split('/upload/');
      if (parts.length === 2) {
        const infoUrl = parts[0] + '/upload/fl_getinfo/' + parts[1];
        https.get(infoUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const info = JSON.parse(data);
              if (info && info.output && info.output.width && info.output.height) {
                resolve(info.output.width / info.output.height);
                return;
              }
            } catch(e) {}
            resolve(1); // fallback
          });
        }).on('error', () => resolve(1));
        return;
      }
    }
    resolve(1);
  });
}

async function fixAspectRatios() {
  await mongoose.connect(process.env.MONGO_URI);
  const Post = mongoose.connection.collection('posts');
  const posts = await Post.find({ aspectRatio: { $exists: false } }).toArray();
  
  console.log(`Found ${posts.length} posts without aspectRatio. Fixing...`);
  
  for (const post of posts) {
    let url = '';
    if (post.mediaUrls && post.mediaUrls.length > 0) url = post.mediaUrls[0];
    else if (post.imageUrl) url = post.imageUrl;
    
    let ratio = 1; // Default
    if (url) {
      ratio = await getRatio(url);
    }
    
    console.log(`Post ${post._id}: URL=${url.substring(0,40)}... Ratio=${ratio}`);
    await Post.updateOne({ _id: post._id }, { $set: { aspectRatio: ratio } });
  }
  
  console.log('All posts updated!');
  mongoose.disconnect();
}

fixAspectRatios().catch(console.error);

const mongoose = require('mongoose');
const xlsx = require('xlsx');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Models
const User = require('../src/models/User');
const Post = require('../src/models/Post');

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MONGO_URI = process.env.MONGO_URI;
const ASSETS_PATH = path.join(__dirname, '..', '..', 'client', 'assets', 'fake data');
const EXCEL_FILE = path.join(ASSETS_PATH, 'Travel.xlsx');

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function completeSeed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const fakeUsers = await User.find({ uid: { $regex: '^fake_' } });
    console.log(`Found ${fakeUsers.length} fake users.`);

    console.log('Reading Excel data...');
    const workbook = xlsx.readFile(EXCEL_FILE);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    console.log(`Total rows in Excel: ${data.length}`);

    // Get existing posts to avoid duplicates (using location + category as a simple check)
    // Actually, imageNum + category is better.
    const existingPosts = await Post.find({ userId: { $regex: '^fake_' } }, 'location category');
    const existingKeys = new Set(existingPosts.map(p => `${p.location}-${p.category}`));

    let addedCount = 0;
    const POST_START_DATE = new Date('2026-01-01');
    const END_DATE = new Date();

    console.log('Starting upload of remaining posts...');

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const category = row['Category'];
      const address = row['Addresse'];
      const imageNum = row['Image number'];
      
      const key = `${address}-${category}`;
      if (existingKeys.has(key)) {
          // console.log(`Skipping already existing post: ${key}`);
          continue;
      }

      const imagePath = path.join(ASSETS_PATH, category, `${imageNum}.jpg`);
      if (!fs.existsSync(imagePath)) continue;

      try {
        const user = fakeUsers[addedCount % fakeUsers.length];
        
        console.log(`[${i+1}/${data.length}] Uploading ${category} image ${imageNum} for @${user.username}...`);
        
        const result = await cloudinary.uploader.upload(imagePath, {
          folder: `posts/${category.toLowerCase()}`,
        });

        const postDate = randomDate(POST_START_DATE, END_DATE);

        const post = new Post({
          userId: user.uid,
          content: row['Description'] || 'Exploring the world!',
          caption: row['Description'] || 'Exploring the world!',
          imageUrl: result.secure_url,
          mediaUrls: [result.secure_url],
          location: address,
          category: category,
          createdAt: postDate,
          updatedAt: postDate
        });

        await post.save();
        addedCount++;
        
        // Update counts periodically or just let it be
      } catch (e) {
        console.error(`Upload failed for row ${i}:`, e.message || e);
        if (e.message && e.message.includes('Rate limit')) {
            console.log('Hitting rate limit, waiting 1 minute...');
            await new Promise(r => setTimeout(r, 60000));
        }
      }
    }

    console.log(`\nCompleted! Added ${addedCount} new posts.`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

completeSeed();

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
const PROFILE_PICS_PATH = path.join(__dirname, '..', '..', 'client', 'assets', 'fake profile');

const TARGET_USERS = [
  { username: 'lena.voss', picNum: 1, bio: '✈️ chasing sunsets, not people' },
  { username: 'nina-ellis', picNum: 2, bio: '🌍 passport > plans' },
  { username: 'ariasloane', picNum: 3, bio: '📍 lost somewhere, loving it' },
  { username: 'mila_corvin', picNum: 4, bio: '✈️ catching flights, not feelings' },
  { username: 'ivy.callen', picNum: 5, bio: '🌴 living out of a carry-on' },
  { username: 'zoe-hartley', picNum: 6, bio: '🗺️ next stop: anywhere' },
  { username: 'elenamirel', picNum: 7, bio: '🌍 collecting moments, not things' },
  { username: 'maya_renzo', picNum: 8, bio: '🎒 wander often, wonder always' },
  { username: 'clara-vance', picNum: 9, bio: '✈️ just landed... again' },
  { username: 'saralennon', picNum: 10, bio: '☀️ sun, sea, repeat' },
  { username: 'alex.marlow', picNum: 11, bio: '🗺️ roaming with no return ticket' },
  { username: 'noahvalen', picNum: 12, bio: '📍 always one trip away' },
  { username: 'lucasarden', picNum: 13, bio: '✈️ work. save. travel. repeat.' },
  { username: 'ethankairo', picNum: 14, bio: '🌲 gone exploring brb' },
  { username: 'leo.santor', picNum: 15, bio: '🗺️ Currently somewhere I can\'t pronounce' },
  { username: 'julian-cross', picNum: 16, bio: '🎒 Out of office, permanently in motion' },
  { username: 'adamvireo', picNum: 17, bio: '📜 I travel so I have stories worth retelling' },
  { username: 'miles_corren', picNum: 18, bio: '🎫 Collecting boarding passes like souvenirs' },
  { username: 'ryan.alvero', picNum: 19, bio: '🌲 If lost, I probably went exploring' },
  { username: 'danielvoss', picNum: 20, bio: '✈️ My plans depend on flight deals' },
  { username: 'oliverkade', picNum: 21, bio: '🍔 Always one airport snack away from happiness' },
  { username: 'layla-santor', picNum: 22, bio: '📍 life\'s better abroad' },
  { username: 'rubycallen', picNum: 23, bio: '🗺️ destination: unknown' },
  { username: 'hannah_voss', picNum: 24, bio: '🌍 globe mode: on 🌍' },
  { username: 'graceelric', picNum: 25, bio: '☕ eat. travel. nap. repeat.' },
  { username: 'lilyromer', picNum: 26, bio: '🌍 making the world my home' },
  { username: 'madison.renzo', picNum: 27, bio: '🌴 tan lines & timelines' },
  { username: 'scarlett-kade', picNum: 28, bio: '🗺️ Traveling to understand, not escape' },
  { username: 'stellacorvin', picNum: 29, bio: '🚶‍♀️ Movement is my way of thinking' },
  { username: 'bella_mirel', picNum: 30, bio: '🌍 The world is my reference point' },
  { username: 'nora.elric', picNum: 31, bio: '🌲 Quiet places, long journeys' },
];

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // 1. Create/Update Users
    console.log('Preparing specific fake users from list...');
    const createdUsers = [];
    const POST_START_DATE = new Date('2026-01-01'); // Posts from Jan 2026
    const END_DATE = new Date(); // Today

    for (const userData of TARGET_USERS) {
      const email = `${userData.username}@example.com`;
      const uid = 'fake_' + crypto.createHash('md5').update(email).digest('hex').slice(0, 16);
      
      // Upload profile picture
      let avatarUrl = null;
      const picPath = path.join(PROFILE_PICS_PATH, `File${userData.picNum}.jpeg`);
      if (fs.existsSync(picPath)) {
          try {
              console.log(`Uploading profile pic for ${userData.username}...`);
              const picResult = await cloudinary.uploader.upload(picPath, {
                  folder: 'profile_pics',
                  public_id: userData.username
              });
              avatarUrl = picResult.secure_url;
          } catch (e) {
              console.error(`Failed to upload profile pic for ${userData.username}:`, e.message);
          }
      }

      // Account created between Jan 2025 and Dec 2025
      const accountCreatedAt = randomDate(new Date('2025-01-01'), new Date('2025-12-31'));

      const user = await User.findOneAndUpdate(
        { username: userData.username },
        {
          $set: {
            username: userData.username,
            displayName: userData.username.replace(/[._-]/g, ' '),
            email: email,
            uid: uid,
            firebaseUid: uid,
            bio: userData.bio,
            avatar: avatarUrl,
            photoURL: avatarUrl,
            profilePicture: avatarUrl,
            password: 'password123',
            provider: 'email',
            createdAt: accountCreatedAt,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      createdUsers.push(user);
    }
    console.log(`${createdUsers.length} users updated (Created in 2025).`);

    // 2. Read and Group Excel Data
    console.log('Reading Excel data...');
    const workbook = xlsx.readFile(EXCEL_FILE);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    
    const categorizedData = {};
    data.forEach(row => {
      const cat = row['Category'];
      if (!categorizedData[cat]) categorizedData[cat] = [];
      categorizedData[cat].push(row);
    });
    
    const categories = Object.keys(categorizedData);

    // 3. Assign Posts to Users (Jan 2026 to Now)
    for (const user of createdUsers) {
      const totalPostsToCreate = Math.floor(Math.random() * 6) + 12; // 12 to 17 posts
      console.log(`\nGenerating ${totalPostsToCreate} posts for @${user.username}...`);

      const userCategories = shuffle([...categories]);
      let postsCreated = 0;
      let catIndex = 0;

      while (postsCreated < totalPostsToCreate && catIndex < userCategories.length) {
        const category = userCategories[catIndex];
        const numFromCat = Math.min(
          totalPostsToCreate - postsCreated, 
          Math.floor(Math.random() * 3) + 2 // 2 to 4 posts per category
        );

        const availableRows = categorizedData[category];
        if (!availableRows || availableRows.length === 0) {
            catIndex++;
            continue;
        }

        for (let j = 0; j < numFromCat; j++) {
          if (postsCreated >= totalPostsToCreate) break;
          
          const rowIndex = Math.floor(Math.random() * availableRows.length);
          const row = availableRows.splice(rowIndex, 1)[0];
          
          const imageNum = row['Image number'];
          const address = row['Addresse'];
          const description = row['Description'] || 'Traveling is living!';
          const imagePath = path.join(ASSETS_PATH, category, `${imageNum}.jpg`);

          if (!fs.existsSync(imagePath)) continue;

          try {
            console.log(`  [Post ${postsCreated + 1}/${totalPostsToCreate}] Uploading ${category} image ${imageNum}...`);
            const result = await cloudinary.uploader.upload(imagePath, {
              folder: `posts/${category.toLowerCase()}`,
            });

            const postDate = randomDate(POST_START_DATE, END_DATE);

            const post = new Post({
              userId: user.uid,
              content: description,
              caption: description,
              imageUrl: result.secure_url,
              mediaUrls: [result.secure_url],
              location: address,
              category: category,
              createdAt: postDate,
              updatedAt: postDate
            });

            await post.save();
            postsCreated++;
          } catch (e) {
            console.error(`  Upload failed:`, e.message);
          }
        }
        catIndex++;
      }
      console.log(`Finished @${user.username}.`);
    }

    console.log('\nGlobal Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

seed();

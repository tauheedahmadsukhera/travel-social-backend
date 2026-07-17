const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/travesocial';

const CLEAN_CATEGORIES = [
  "Adventure",
  "Mountain",
  "Surfing",
  "Camping",
  "Ski",
  "Road Trips",
  "Waterfalls",
  "Cruise",
  "Trekking",
  "Island",
  "Diving",
  "City Break",
  "Urban",
  "Tropical",
  "National Parks",
  "Hiking",
  "Desert",
  "Jungle",
  "Extreme Sports",
  "Glamping",
  "Safari",
  "Nature",
  "Lakes",
  "Beach",
  "Food and Dining",
  "Luxury",
  "Historical",
  "Cultural",
  "Digital Nomad",
  "Solo Travel",
  "Backpacking",
  "Architecture",
  "Museums",
  "Wellness",
  "Art",
  "Wine Regions",
  "Yoga",
  "Honeymoon",
  "Family Friendly",
  "Travel",
  "Food",
  "Festivals",
  "Budget",
  "Romantic",
  "London",
  "City Life"
];

async function run() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected!');

    // Initialize Category Schema
    require('../src/models/Category');
    const Category = mongoose.model('Category');

    console.log('Deleting existing categories...');
    const delResult = await Category.deleteMany({});
    console.log(`Deleted ${delResult.deletedCount} categories.`);

    console.log('Inserting new clean categories...');
    const docs = CLEAN_CATEGORIES.map(name => ({
      name,
      image: name.toLowerCase().replace(/\s+/g, '_') // Fallback image key
    }));

    const insertResult = await Category.insertMany(docs);
    console.log(`Successfully inserted ${insertResult.length} categories.`);

    // If redis is running, let's clear the categories cache
    try {
      const queueService = require('../services/queue');
      const redisClient = queueService.redisClient;
      const isRedisAvailable = queueService.isRedisAvailable;
      if (isRedisAvailable && isRedisAvailable()) {
        console.log('Clearing Redis cache keys for categories...');
        const keys = await redisClient.keys('c:*'); // Cache keys starting with c: or similar cache middleware pattern
        if (keys.length > 0) {
          await redisClient.del(...keys);
          console.log(`Cleared cache keys: ${keys.join(', ')}`);
        }
      }
    } catch (cacheErr) {
      console.log('Redis cache flush skipped:', cacheErr.message);
    }

  } catch (error) {
    console.error('Error running script:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database.');
  }
}

run();

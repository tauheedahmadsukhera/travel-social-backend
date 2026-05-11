const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Conversation = require('../models/Conversation');

async function unsetMessages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB.');

    // Remove the messages array from all documents to free up space
    const result = await Conversation.collection.updateMany(
      { messages: { $exists: true } },
      { $unset: { messages: "" } }
    );

    console.log(`Successfully unset 'messages' array from ${result.modifiedCount} conversations.`);
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

unsetMessages();

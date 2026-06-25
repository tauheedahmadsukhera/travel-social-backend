const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

async function migrateMessages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB.');

    // Find all conversations that have messages embedded
    const conversations = await Conversation.find({ 'messages.0': { $exists: true } }).lean();
    console.log(`Found ${conversations.length} conversations with embedded messages to migrate.`);

    let totalMigrated = 0;

    for (const conv of conversations) {
      if (!conv.messages || conv.messages.length === 0) continue;

      console.log(`Migrating ${conv.messages.length} messages for conversation ${conv.conversationId}...`);
      
      const newMessages = conv.messages.map(msg => {
        // Convert subdocument to plain object
        const msgObj = msg.toObject ? msg.toObject() : msg;
        
        // Remove the internal subdocument _id, we want the collection _id
        delete msgObj._id;
        
        return {
          ...msgObj,
          conversationId: conv.conversationId
        };
      });

      // Insert into the new Message collection
      await Message.insertMany(newMessages, { ordered: false }).catch(err => {
        console.warn(`Some messages might be duplicates in ${conv.conversationId}: ${err.message}`);
      });
      
      totalMigrated += newMessages.length;
    }

    console.log(`\nMigration complete! Successfully migrated ${totalMigrated} messages.`);
    console.log('\nNOTE: The embedded messages have NOT been deleted from Conversation yet.');
    console.log('You should verify the data in the Message collection, and then run a script to $unset the messages array from Conversations.');
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrateMessages();

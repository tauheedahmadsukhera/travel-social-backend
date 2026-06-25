const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI).then(async () => {
    console.log('✅ Connected to MongoDB');
    require('../models/Notification');
    const Notification = mongoose.model('Notification');
    
    const total = await Notification.countDocuments();
    const sample = await Notification.find().sort({ createdAt: -1 }).limit(5).lean();
    
    console.log(`\n📊 Notifications Audit:`);
    console.log(`- Total Notifications: ${total}`);
    
    if (sample.length > 0) {
        console.log('\n📝 Latest 5 Notifications:');
        sample.forEach((n, i) => {
            console.log(`  [${i+1}] To: ${n.recipientId} | Type: ${n.type} | Message: ${n.message}`);
            console.log(`      From: ${n.senderName || 'N/A'} (ID: ${n.senderId})`);
            console.log(`      Created: ${n.createdAt}`);
            console.log('      -------------------');
        });
    } else {
        console.log('\n❌ NO NOTIFICATIONS FOUND IN DATABASE.');
    }
    
    mongoose.connection.close();
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
});

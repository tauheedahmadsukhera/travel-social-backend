const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI).then(async () => {
    console.log('✅ Connected to MongoDB');
    require('../models/User'); // Load schema
    const User = mongoose.model('User');
    
    const usersWithTokens = await User.find({ pushToken: { $ne: null } }).select('email displayName pushToken');
    const totalUsers = await User.countDocuments();
    
    console.log(`\n📊 Notification Audit:`);
    console.log(`- Total Users: ${totalUsers}`);
    console.log(`- Users with Push Tokens: ${usersWithTokens.length}`);
    
    if (usersWithTokens.length > 0) {
        console.log('\n📱 Sample Tokens:');
        usersWithTokens.slice(0, 5).forEach(u => {
            console.log(`  - ${u.displayName} (${u.email}): ${u.pushToken.substring(0, 20)}...`);
        });
    } else {
        console.log('\n❌ NO PUSH TOKENS FOUND IN DATABASE. This is why notifications are failing.');
    }
    
    mongoose.connection.close();
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
});

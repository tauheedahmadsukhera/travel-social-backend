const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI).then(async () => {
    console.log('✅ Connected to MongoDB');
    require('../models/User');
    require('../models/Notification');
    const User = mongoose.model('User');
    const Notification = mongoose.model('Notification');
    
    // Check for a specific user (e.g., test@gmail.com)
    const user = await User.findOne({ email: /test@gmail.com/i }).lean();
    
    if (user) {
        console.log(`\n👤 User Found: ${user.displayName}`);
        console.log(`- _id (Mongo): ${user._id}`);
        console.log(`- firebaseUid: ${user.firebaseUid || 'N/A'}`);
        console.log(`- uid: ${user.uid || 'N/A'}`);
        
        const candidates = [String(user._id), user.firebaseUid, user.uid].filter(Boolean);
        console.log(`- All ID Candidates: ${candidates.join(', ')}`);
        
        // Find notifications for ANY of these candidates
        const notifications = await Notification.find({
            recipientId: { $in: candidates }
        }).sort({ createdAt: -1 }).limit(10).lean();
        
        console.log(`\n🔔 Notifications for this user: ${notifications.length}`);
        notifications.forEach((n, i) => {
            console.log(`  [${i+1}] To: ${n.recipientId} | Message: ${n.message}`);
        });
        
        // Check if there are notifications with IDs NOT in candidates but maybe meant for them
        const orphaned = await Notification.find({
            recipientId: { $nin: candidates },
            message: /commented|liked/i
        }).limit(5).lean();
        
        if (orphaned.length > 0) {
            console.log(`\n⚠️ Other notifications in DB (meant for someone else?):`);
            orphaned.forEach((n, i) => {
                console.log(`  [${i+1}] To: ${n.recipientId} | Message: ${n.message}`);
            });
        }
    } else {
        console.log('\n❌ USER test@gmail.com NOT FOUND.');
    }
    
    mongoose.connection.close();
}).catch(err => {
    console.error('❌ Error:', err);
});

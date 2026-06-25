const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI).then(async () => {
    console.log('✅ Connected to MongoDB');
    require('../models/Notification');
    const Notification = mongoose.model('Notification');
    
    // 1. Cleanup orphaned notifications (null recipientId)
    const deleted = await Notification.deleteMany({ recipientId: null });
    console.log(`🗑️ Deleted ${deleted.deletedCount} orphaned notifications.`);

    // 2. Normalize valid notifications
    const notifications = await Notification.find({ recipientId: { $ne: null } });
    console.log(`Processing ${notifications.length} valid notifications...`);
    
    let fixed = 0;
    for (const n of notifications) {
        let changed = false;
        
        // Fix case sensitivity
        if (n.type && n.type !== n.type.toLowerCase()) {
            n.type = n.type.toLowerCase();
            changed = true;
        }
        
        // Ensure type exists
        if (!n.type) {
            const msg = (n.message || '').toLowerCase();
            if (msg.includes('like')) n.type = 'like';
            else if (msg.includes('comment')) n.type = 'comment';
            else if (msg.includes('follow')) n.type = 'follow';
            else if (msg.includes('message')) n.type = 'message';
            else n.type = 'generic';
            changed = true;
        }

        // Fix null sender names
        if (!n.senderName) {
            n.senderName = 'Someone';
            changed = true;
        }

        if (changed) {
            await Notification.updateOne({ _id: n._id }, { $set: { 
                type: n.type, 
                senderName: n.senderName 
            }});
            fixed++;
        }
    }
    
    console.log(`✅ Cleanup Complete. Fixed ${fixed} notifications.`);
    mongoose.connection.close();
}).catch(err => {
    console.error('❌ Error:', err);
});

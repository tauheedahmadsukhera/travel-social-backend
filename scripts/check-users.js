const mongoose = require('mongoose');
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

async function checkUser() {
  const uri = "mongodb://martin:martinadmin@ac-qemnb5t-shard-00-00.st1rogr.mongodb.net:27017,ac-qemnb5t-shard-00-01.st1rogr.mongodb.net:27017,ac-qemnb5t-shard-00-02.st1rogr.mongodb.net:27017/travesocial?ssl=true&replicaSet=atlas-13h75w-shard-0&authSource=admin&retryWrites=true&w=majority";
  try {
    await mongoose.connect(uri);
    const users = await User.find({}).limit(5);
    console.log('Sample Users:');
    users.forEach(u => {
      console.log(`- Name: ${u.displayName || u.name}, _id: ${u._id}, uid: ${u.uid}, firebaseUid: ${u.firebaseUid}`);
    });
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkUser();

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    select: false, // SECURITY: Never returned in queries by default. Use .select('+password') when needed for auth.
    // Password is required only for email/password auth
    // Optional if using Firebase only
  },
  displayName: {
    type: String,
    default: 'User',
  },
  avatar: {
    type: String,
    default: null,
  },
  photoURL: {
    type: String,
    default: null,
  },
  profilePicture: {
    type: String,
    default: null,
  },

  firebaseUid: {
    type: String,
    unique: true,
    sparse: true, // Allow multiple null values
  },
  uid: {
    type: String,
    unique: true,
    sparse: true,
  },
  pushToken: {
    type: String,
    default: null,
  },
  pushTokenUpdatedAt: {
    type: Date,
    default: null,
  },
  provider: {
    type: String,
    enum: ['email', 'google', 'apple', 'facebook'],
    default: 'email',
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user',
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'banned'],
    default: 'active',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  lastLogin: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastSeen: {
    type: Date,
    default: null,
  },
  // Additional user info
  bio: {
    type: String,
    default: '',
  },
  followersCount: {
    type: Number,
    default: 0,
  },
  followingCount: {
    type: Number,
    default: 0,
  },
  location: {
    type: String,
    default: '',
  },
  website: {
    type: String,
    default: '',
  },
  phoneNumber: {
    type: String,
    default: '',
  },
  // Account settings
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  notificationsEnabled: {
    type: Boolean,
    default: true,
  },
  privacyLevel: {
    type: String,
    enum: ['public', 'private', 'followers'],
    default: 'public',
  },
  isPrivate: {
    type: Boolean,
    default: false,
  },
  blockedUsers: [{
    type: String
  }],
  lastKnownLocation: {
    city: String,
    country: String,
    countryCode: String,
    latitude: Number,
    longitude: Number,
    place: String,
    timestamp: Number
  },
  resetCode: {
    type: String,
    default: null,
  },
  resetCodeExpires: {
    type: Date,
    default: null,
  },
});

// Ensure virtuals are serialized in JSON and Object outputs
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

UserSchema.pre('save', function(next) {
  const av = this.avatar || this.photoURL || this.profilePicture || null;
  this.avatar = av;
  this.photoURL = av;
  this.profilePicture = av;
  this.updatedAt = new Date();
  next();
});

// Middleware hooks to sync duplicate profile fields on queries updating the User
function syncAvatars(next) {
  const update = this.getUpdate();
  if (update) {
    let av = update.avatar || update.photoURL || update.profilePicture;
    if (update.$set) {
      av = av || update.$set.avatar || update.$set.photoURL || update.$set.profilePicture;
    }
    
    if (av !== undefined) {
      if (update.$set) {
        update.$set.avatar = av;
        update.$set.photoURL = av;
        update.$set.profilePicture = av;
      } else {
        update.avatar = av;
        update.photoURL = av;
        update.profilePicture = av;
      }
    }
  }
  next();
}

UserSchema.pre('updateOne', syncAvatars);
UserSchema.pre('findOneAndUpdate', syncAvatars);
UserSchema.pre('updateMany', syncAvatars);

// Indexes for fast queries
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ firebaseUid: 1 });
UserSchema.index({ uid: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ displayName: 'text' }); // Added for search performance

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);

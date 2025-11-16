import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  pl: {
    // plan (ex: 'free')
    type: String,
    required: true,
    default: 'free'
  },
  maxSites: {
    type: Number,
    required: true,
    default: 2
  },
  // Préférences de notifications email
  emailNotificationsEnabled: {
    type: Boolean,
    default: false
  },
  // Token FCM pour les notifications push
  pushToken: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

export default User;

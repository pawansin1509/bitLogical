const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, index: true, unique: true },
  password: String,
  verified: { type: Boolean, default: false },
  verificationCode: String,
  createdAt: { type: Date, default: Date.now }
});

const PostingSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  type: String,
  item: String,
  desc: String,
  location: String,
  contactName: String,
  contactInfo: String,
  attachment: String,
  created: { type: Date, default: Date.now }
});

const ConversationSchema = new mongoose.Schema({
  postingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Posting' },
  posting: Object,
  participants: [ { type: mongoose.Schema.Types.ObjectId, ref: 'User' } ],
  messages: [ { fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, name: String, text: String, ts: Date } ],
  created: { type: Date, default: Date.now }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  Posting: mongoose.model('Posting', PostingSchema),
  Conversation: mongoose.model('Conversation', ConversationSchema)
};
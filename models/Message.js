const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  isPrivate: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

messageSchema.index({ user: 1, timestamp: -1 });
messageSchema.index({ toUser: 1, timestamp: -1 });
messageSchema.index({ isPrivate: 1, timestamp: -1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
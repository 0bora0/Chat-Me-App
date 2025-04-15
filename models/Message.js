const mongoose = require('mongoose');
const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isPrivate: {
    type: Boolean,
    default: false
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

messageSchema.index({ user: 1, timestamp: -1 });
messageSchema.index({ isPrivate: 1, timestamp: -1 });
messageSchema.virtual('formattedTime').get(function() {
  return this.timestamp.toLocaleTimeString();
});

module.exports = mongoose.model('Message', messageSchema);
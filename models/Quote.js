const mongoose = require('mongoose');

const QuoteSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quoter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  customerFile: {
    filename: String,
    originalName: String,
    path: String,
    size: Number
  },
  quoterFile: {
    filename: String,
    originalName: String,
    path: String,
    size: Number
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled', 'rejected'],
    default: 'pending'
  },
  customerMessage: {
    type: String
  },
  quoterMessage: {
    type: String
  },
  rejectReason: {
    type: String
  },
  price: {
    type: Number
  },
  currency: {
    type: String,
    default: 'CNY'
  },
  validUntil: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Quote', QuoteSchema);
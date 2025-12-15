const mongoose = require('mongoose');

const customerGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: '#28a745' // 绿色，区别于供应商群组的蓝色
  },
  isActive: {
    type: Boolean,
    default: true
  },
  customers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// 创建索引
customerGroupSchema.index({ isActive: 1 });
customerGroupSchema.index({ createdBy: 1 });

module.exports = mongoose.model('CustomerGroup', customerGroupSchema);
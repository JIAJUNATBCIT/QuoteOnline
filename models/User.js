const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['customer', 'quoter', 'supplier', 'admin'],
    default: 'customer'
  },
  name: {
    type: String,
    required: true
  },
  company: {
    type: String
  },
  phone: {
    type: String
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  supplierGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierGroup'
  }],
  customerGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomerGroup'
  }],
  customerGroupMembership: [{
    customerGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerGroup'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }]
}, {
  timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
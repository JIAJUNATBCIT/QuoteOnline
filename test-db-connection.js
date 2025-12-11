require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./config/config');

console.log('Testing database connection...');
console.log('Environment:', process.env.NODE_ENV);
console.log('MongoDB URI:', config.mongodb.uri);
console.log('MongoDB Options:', JSON.stringify(config.mongodb.options, null, 2));

mongoose.connect(config.mongodb.uri, config.mongodb.options)
  .then(() => {
    console.log('✅ Database connected successfully');
    
    // Test a simple query
    const User = require('./models/User');
    return User.findOne({ email: 'test@example.com' });
  })
  .then(user => {
    console.log('✅ Query successful:', user ? { email: user.email, name: user.name } : 'User not found');
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('❌ Database error:', err);
    mongoose.connection.close();
  });
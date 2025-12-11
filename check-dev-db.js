const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/quoteonline')
  .then(async () => {
    console.log('Connected to dev database');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    if (collections.some(c => c.name === 'users')) {
      const User = require('./models/User');
      const users = await User.find({});
      console.log('Total users in dev DB:', users.length);
      
      const testUser = await User.findOne({ email: 'test@example.com' });
      console.log('Test user found in dev DB:', !!testUser);
      
      if (!testUser) {
        console.log('Creating test user in dev DB...');
        const newUser = new User({
          email: 'test@example.com',
          password: '123456',
          name: 'Test User',
          role: 'admin'
        });
        await newUser.save();
        console.log('Test user created in dev DB');
      }
    } else {
      console.log('No users collection in dev DB');
    }
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Dev database connection error:', err);
  });
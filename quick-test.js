const mongoose = require('mongoose');

async function testDirectLogin() {
  console.log('=== DIRECT LOGIN TEST ===');
  
  // Connect to database
  await mongoose.connect('mongodb://localhost:27017/quoteonline');
  console.log('✅ Connected to database');
  
  // Test user authentication directly
  const User = require('./models/User');
  const user = await User.findOne({ email: 'test@example.com', isActive: true });
  
  if (!user) {
    console.log('❌ User not found or inactive');
    return;
  }
  
  console.log('✅ User found:', {
    email: user.email,
    name: user.name,
    isActive: user.isActive
  });
  
  const isMatch = await user.comparePassword('123456');
  console.log('🔐 Password match:', isMatch);
  
  if (isMatch) {
    console.log('✅ Direct authentication successful!');
  } else {
    console.log('❌ Direct authentication failed');
  }
  
  await mongoose.connection.close();
}

async function testViaServer() {
  console.log('\n=== SERVER API TEST ===');
  
  const http = require('http');
  
  const postData = JSON.stringify({
    email: 'test@example.com',
    password: '123456'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log('📡 Server response status:', res.statusCode);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log('📡 Server response:', response);
        
        if (response.accessToken) {
          console.log('✅ Server authentication successful!');
        } else {
          console.log('❌ Server authentication failed');
        }
      } catch (e) {
        console.log('📡 Raw server response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Server request error:', error);
  });

  req.write(postData);
  req.end();
}

async function runTests() {
  try {
    await testDirectLogin();
    await testViaServer();
  } catch (error) {
    console.error('Test error:', error);
  }
}

runTests();
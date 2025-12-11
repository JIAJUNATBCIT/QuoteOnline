require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

console.log('Starting debug server...');
console.log('MongoDB URI:', process.env.MONGODB_URI);

const app = express();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser middleware
app.use(require('cookie-parser')());

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Load routes one by one
try {
  console.log('Loading auth route...');
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth route loaded');
} catch (err) {
  console.error('❌ Auth route error:', err.message);
}

try {
  console.log('Loading config route...');
  app.use('/api/config', require('./routes/config'));
  console.log('✅ Config route loaded');
} catch (err) {
  console.error('❌ Config route error:', err.message);
}

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Debug server is working', timestamp: new Date() });
});

// Connect to database and start server
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 60000,
  connectTimeoutMS: 10000
})
.then(() => {
  console.log('✅ Database connected');
  
  const PORT = 3000;
  const server = app.listen(PORT, () => {
    console.log(`✅ Debug server running on port ${PORT}`);
  });
  
  server.timeout = 30000;
})
.catch(err => {
  console.error('❌ Database connection failed:', err.message);
  process.exit(1);
});

// Handle errors
mongoose.connection.on('error', (err) => {
  console.error('Database error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Database disconnected');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});
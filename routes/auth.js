const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  getRefreshTokenFromRequest 
} = require('../utils/tokenUtils');
const router = express.Router();

// Simple test endpoint
router.get('/test', (req, res) => {
  console.log('Auth test endpoint hit!');
  res.json({ message: 'Auth routes are working!' });
});

// Debug login endpoint
router.post('/debug-login', async (req, res) => {
  try {
    console.log('=== DEBUG LOGIN START ===');
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    
    const { email, password } = req.body;
    console.log('Extracted email:', email);
    console.log('Extracted password length:', password?.length);
    
    // Check if user exists
    const user = await User.findOne({ email, isActive: true });
    console.log('User found:', !!user);
    
    if (!user) {
      console.log('Login failed: User not found or inactive');
      return res.status(400).json({ message: '无效的邮箱或密码', reason: 'user_not_found' });
    }

    console.log('User details:', {
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      passwordHash: user.password.substring(0, 20) + '...'
    });

    // Check password
    const isMatch = await user.comparePassword(password);
    console.log('Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('Login failed: Password mismatch');
      return res.status(400).json({ message: '无效的邮箱或密码', reason: 'password_mismatch' });
    }

    console.log('Login successful!');
    res.json({ message: '登录成功', debug: true });
    
  } catch (error) {
    console.error('Debug login error:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, company, phone, role } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: '用户已存在' });
    }

    // Create new user
    user = new User({
      email,
      password,
      name,
      company,
      phone,
      role: role || 'customer' // 默认角色为 customer
    });

    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3 * 24 * 60 * 60 * 1000 // 3天
    });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: user.company
      }
    });
  } catch (error) {
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: '请填写所有必填字段', 
        errors: errors 
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ 
        message: `${field === 'email' ? '邮箱' : field}已存在` 
      });
    }
    
    // Handle other errors
    console.error('Registration error:', error);
    res.status(500).json({ message: '服务器错误', error: process.env.NODE_ENV === 'development' ? error.message : '请稍后重试' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    console.log('=== LOGIN ATTEMPT STARTED ===');
    console.log('Timestamp:', new Date().toISOString());
    const { email, password } = req.body;
    console.log('Request body:', req.body);
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Email:', email);
    console.log('Password length:', password?.length);
    
    // Check if user exists
    console.log('Searching for user with email:', email, 'and isActive:', true);
    const user = await User.findOne({ email: email, isActive: true });
    console.log('User found:', !!user);
    
    if (!user) {
      console.log('Login failed: User not found or inactive');
      // Try to find user regardless of active status for debugging
      const anyUser = await User.findOne({ email });
      console.log('User exists but inactive?', !!anyUser);
      return res.status(400).json({ message: '无效的邮箱或密码' });
    }

    console.log('User details:', {
      _id: user._id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      passwordHash: user.password.substring(0, 20) + '...'
    });

    // Check password
    console.log('Comparing password...');
    const isMatch = await user.comparePassword(password);
    console.log('Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('Login failed: Password mismatch');
      return res.status(400).json({ message: '无效的邮箱或密码' });
    }

    console.log('Login successful for user:', email);

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3 * 24 * 60 * 60 * 1000 // 3天
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: user.company
      }
    });
  } catch (error) {
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: '请填写所有必填字段', 
        errors: errors 
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ 
        message: `${field === 'email' ? '邮箱' : field}已存在` 
      });
    }
    
    // Handle other errors
    console.error('Registration error:', error);
    res.status(500).json({ message: '服务器错误', error: process.env.NODE_ENV === 'development' ? error.message : '请稍后重试' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: '请填写所有必填字段', 
        errors: errors 
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ 
        message: `${field === 'email' ? '邮箱' : field}已存在` 
      });
    }
    
    // Handle other errors
    console.error('Registration error:', error);
    res.status(500).json({ message: '服务器错误', error: process.env.NODE_ENV === 'development' ? error.message : '请稍后重试' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send password reset email
    const emailService = require('../services/mailgunService');
    await emailService.sendPasswordReset(email, resetToken);

    res.json({ 
      message: '密码重置链接已发送到您的邮箱'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: '发送重置邮件失败', error: error.message });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    
    if (!refreshToken) {
      return res.status(401).json({ message: '未提供 refresh token' });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Check if user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: '用户不存在或已被禁用' });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({ 
      userId: user._id, 
      role: user.role 
    });

    // Generate new refresh token (token rotation)
    const newRefreshToken = generateRefreshToken({ 
      userId: user._id, 
      role: user.role 
    });

    // Set new refresh token in httpOnly cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3 * 24 * 60 * 60 * 1000 // 3天
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ message: '无效或过期的 refresh token' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(400).json({ message: '无效的token' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: '密码重置成功' });
  } catch (error) {
    res.status(400).json({ message: '无效或过期的token' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  // Clear refresh token cookie
  res.clearCookie('refreshToken');
  res.json({ message: '登出成功' });
});

module.exports = router;
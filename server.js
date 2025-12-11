const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // 首先加载环境变量
const logger = require('./utils/logger');
const config = require('./config/config'); // 然后加载配置

const app = express();

// CORS配置
app.use(cors({
  origin: config.cors.origins,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Cookie parser middleware
app.use(require('cookie-parser')());

app.use(express.json({ 
  limit: `${config.server.maxFileSize}mb`,
  type: ['application/json', 'text/plain']
})); 
app.use(express.urlencoded({ 
  extended: true, 
  limit: `${config.server.maxFileSize}mb`, 
  parameterLimit: 1000 
}));

// 请求时间记录中间件
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  // 记录请求开始
  logger.info(`请求开始: ${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')
  });
  
  // 特殊调试登录请求
  if (req.path === '/api/auth/login') {
    console.log('🔍 LOGIN REQUEST DETECTED:', {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers
    });
  }
  
  // 请求超时处理
  res.setTimeout(config.server.timeout, () => {
    logger.error(`请求超时: ${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      duration: `${Date.now() - req.startTime}ms`
    });
    if (!res.headersSent) {
      res.status(408).json({ message: '请求超时' });
    }
  });
  
  // 监听响应结束以记录总时间
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    
    // 记录慢请求（超过5秒）
    if (duration > 5000) {
      logger.warn(`慢请求警告: ${req.method} ${req.url}`, {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    }
  });
  
  next();
});

// Serve static files
app.use(config.frontend.uploadUrl, express.static(path.join(__dirname, config.server.uploadPath)));

// Connect to MongoDB with optimized settings
mongoose.connection.on('connected', () => {
  logger.info('MongoDB 连接已建立');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB 连接错误', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB 连接已断开');
});

mongoose.connect(config.mongodb.uri, config.mongodb.options)
.then(() => {
  logger.info('MongoDB 连接成功');
  
  // Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/quotes', require('./routes/quotes'));
  app.use('/api/groups', require('./routes/groups'));
  app.use('/api/config', require('./routes/config'));

  // Serve Angular app in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'client/dist')));
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'client/dist/index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    logger.info(`服务器启动成功`, { port: PORT, env: process.env.NODE_ENV });
  });

  // 设置服务器超时
  server.timeout = 30000; // 30秒
  server.keepAliveTimeout = 65000; // 65秒
  server.headersTimeout = 66000; // 66秒

  // 优雅关闭
  process.on('SIGTERM', async () => {
    logger.info('收到 SIGTERM 信号，开始优雅关闭...');
    server.close(async () => {
      logger.info('HTTP 服务器已关闭');
      await mongoose.connection.close();
      logger.info('MongoDB 连接已关闭');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('收到 SIGINT 信号，开始优雅关闭...');
    server.close(async () => {
      logger.info('HTTP 服务器已关闭');
      await mongoose.connection.close();
      logger.info('MongoDB 连接已关闭');
      process.exit(0);
    });
  });

})
.catch(err => {
  logger.error('MongoDB 连接失败', { error: err.message });
  process.exit(1);
});

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝', { reason: reason.toString() });
});
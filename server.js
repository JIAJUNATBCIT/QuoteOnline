const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());

// Cookie parser middleware
app.use(require('cookie-parser')());

app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 1000 }));

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
  
  // 请求超时处理
  res.setTimeout(60000, () => { // 增加到60秒，适应文件上传
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB with optimized settings
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quoteonline', {
  maxPoolSize: 10, // 连接池最大连接数
  serverSelectionTimeoutMS: 5000, // 服务器选择超时
  socketTimeoutMS: 45000, // Socket超时
})
.then(() => {
  logger.info('MongoDB 连接成功');
  
  // 监听连接事件
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB 连接已建立');
  });
  
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB 连接错误', { error: err.message });
  });
  
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB 连接已断开');
  });
})
.catch(err => logger.error('MongoDB 连接失败', { error: err.message }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/groups', require('./routes/groups'));

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
    try {
      await mongoose.connection.close();
      logger.info('MongoDB 连接已关闭');
    } catch (error) {
      logger.error('关闭 MongoDB 连接时出错', { error: error.message });
    }
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('收到 SIGINT 信号，开始优雅关闭...');
  server.close(async () => {
    logger.info('HTTP 服务器已关闭');
    try {
      await mongoose.connection.close();
      logger.info('MongoDB 连接已关闭');
    } catch (error) {
      logger.error('关闭 MongoDB 连接时出错', { error: error.message });
    }
    process.exit(0);
  });
});

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝', { reason: reason.toString() });
});
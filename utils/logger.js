const fs = require('fs');
const path = require('path');

// 确保日志目录存在
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志级别
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// 获取当前日期字符串
function getDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

// 格式化日志消息
function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

// 写入日志文件
function writeLog(level, message, meta = {}) {
  const logFile = path.join(logDir, `${getDateString()}.log`);
  const logMessage = formatMessage(level, message, meta);
  
  try {
    fs.appendFileSync(logFile, logMessage, 'utf8');
    
    // 错误级别的日志同时写入错误日志文件
    if (level === LOG_LEVELS.ERROR) {
      const errorLogFile = path.join(logDir, 'error.log');
      fs.appendFileSync(errorLogFile, logMessage, 'utf8');
    }
  } catch (error) {
    console.error('写入日志文件失败:', error);
    // 如果写入文件失败，仍然输出到控制台作为备选
    console.log(logMessage.trim());
  }
}

// 日志对象
const logger = {
  error: (message, meta = {}) => writeLog(LOG_LEVELS.ERROR, message, meta),
  warn: (message, meta = {}) => writeLog(LOG_LEVELS.WARN, message, meta),
  info: (message, meta = {}) => writeLog(LOG_LEVELS.INFO, message, meta),
  debug: (message, meta = {}) => writeLog(LOG_LEVELS.DEBUG, message, meta),
  
  // 请求日志专用方法
  request: (req, duration, error = null) => {
    const meta = {
      method: req.method,
      url: req.url,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      duration: `${duration}ms`,
      userId: req.user?.userId,
      userRole: req.user?.role
    };
    
    if (error) {
      meta.error = error.message;
      meta.stack = error.stack;
      logger.error(`请求失败: ${req.method} ${req.url}`, meta);
    } else {
      logger.info(`请求完成: ${req.method} ${req.url}`, meta);
    }
  },
  
  // 邮件日志专用方法
  email: (action, to, quoteNumber, success, error = null) => {
    const meta = {
      action,
      to,
      quoteNumber,
      success
    };
    
    if (error) {
      meta.error = error.message;
      logger.error(`邮件${action}失败`, meta);
    } else {
      logger.info(`邮件${action}成功`, meta);
    }
  },
  
  // 数据库操作日志
  database: (operation, collection, query, duration, error = null) => {
    const meta = {
      operation,
      collection,
      query: JSON.stringify(query),
      duration: `${duration}ms`
    };
    
    if (error) {
      meta.error = error.message;
      logger.error(`数据库${operation}失败`, meta);
    } else {
      logger.debug(`数据库${operation}完成`, meta);
    }
  }
};

// 清理旧日志文件（保留最近30天）
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logDir);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    files.forEach(file => {
      if (file.endsWith('.log') && file !== 'error.log') {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < thirtyDaysAgo) {
          fs.unlinkSync(filePath);
          logger.info(`清理旧日志文件: ${file}`);
        }
      }
    });
  } catch (error) {
    console.error('清理旧日志文件失败:', error);
  }
}

// 每天清理一次旧日志
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

module.exports = logger;
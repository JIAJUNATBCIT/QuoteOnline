const path = require('path');

// 基础配置（所有环境共享）
const baseConfig = {
  // 数据库配置
  mongodb: {
    // 将在环境配置中定义
  },
  
  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d'
  },
  
  // 服务器配置
  server: {
    port: process.env.PORT || 3000,
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    timeout: 60000 // 60秒
  },
  
  // 邮件配置
  email: {
    mailgunApiKey: process.env.MAILGUN_API_KEY,
    mailgunDomain: process.env.MAILGUN_DOMAIN,
    from: process.env.EMAIL_FROM || 'noreply@example.com'
  },
  
  // 业务配置
  business: {
    itemsPerPageOptions: [5, 10, 20, 50],
    defaultItemsPerPage: 10,
    maxFilesCount: 10,
    allowedFileExtensions: ['.xlsx', '.xls'],
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/excel'
    ]
  }
};

// 环境特定配置
const environments = {
  development: {
    // 数据库
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/quoteonline_dev',
      options: {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      }
    },
    
    // 前端配置
    frontend: {
      url: process.env.FRONTEND_URL || 'http://localhost:4200',
      apiUrl: 'http://localhost:3000/api',
      uploadUrl: 'http://localhost:3000/uploads'
    },
    
    // CORS配置
    cors: {
      origins: ['http://localhost:4200', 'http://localhost:3000'],
      credentials: true
    },
    
    // 开发环境特定
    logging: {
      level: 'debug',
      console: true,
      file: false
    },
    
    // 安全配置（开发环境宽松）
    security: {
      bcryptRounds: 10,
      rateLimitWindowMs: 15 * 60 * 1000, // 15分钟
      rateLimitMax: 1000 // 开发环境放宽限制
    }
  },
  
  production: {
    // 数据库
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/quoteonline',
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      }
    },
    
    // 前端配置
    frontend: {
      url: process.env.FRONTEND_URL || 'https://portal.ooishipping.com',
      apiUrl: '/api', // 生产环境使用相对路径，通过nginx代理
      uploadUrl: '/uploads'
    },
    
    // CORS配置
    cors: {
      origins: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['https://portal.ooishipping.com'],
      credentials: true
    },
    
    // 生产环境特定
    logging: {
      level: 'info',
      console: false,
      file: true
    },
    
    // 安全配置（生产环境严格）
    security: {
      bcryptRounds: 12,
      rateLimitWindowMs: 15 * 60 * 1000, // 15分钟
      rateLimitMax: 100 // 生产环境严格限制
    }
  },
  
  test: {
    // 测试环境配置
    mongodb: {
      uri: process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/quoteonline_test',
      options: {
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      }
    },
    
    frontend: {
      url: process.env.FRONTEND_URL || 'http://localhost:4200',
      apiUrl: 'http://localhost:3000/api',
      uploadUrl: 'http://localhost:3000/uploads'
    },
    
    cors: {
      origins: ['http://localhost:4200'],
      credentials: true
    },
    
    logging: {
      level: 'error',
      console: false,
      file: false
    },
    
    security: {
      bcryptRounds: 4, // 测试环境快速哈希
      rateLimitWindowMs: 15 * 60 * 1000,
      rateLimitMax: 10000
    }
  }
};

// 获取当前环境
const getEnvironment = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  return environments[nodeEnv] || environments.development;
};

// 合并配置
const createConfig = () => {
  const envConfig = getEnvironment();
  const config = {
    ...baseConfig,
    ...envConfig,
    mongodb: {
      ...baseConfig.mongodb,
      ...envConfig.mongodb
    },
    frontend: {
      ...envConfig.frontend
    },
    cors: {
      ...envConfig.cors
    },
    logging: {
      ...envConfig.logging
    },
    security: {
      ...envConfig.security
    }
  };
  
  // 验证必需的环境变量
  if (!config.email.mailgunApiKey) {
    console.warn('警告: MAILGUN_API_KEY 环境变量未设置');
  }
  
  if (!config.email.mailgunDomain) {
    console.warn('警告: MAILGUN_DOMAIN 环境变量未设置');
  }
  
  return config;
};

// 导出配置
const config = createConfig();

// 添加便捷方法
config.isDevelopment = process.env.NODE_ENV === 'development';
config.isProduction = process.env.NODE_ENV === 'production';
config.isTest = process.env.NODE_ENV === 'test';

// 前端配置获取方法（用于API返回）
config.getFrontendConfig = () => ({
  apiUrl: config.frontend.apiUrl,
  frontendUrl: config.frontend.url,
  uploadUrl: config.frontend.uploadUrl,
  maxFileSize: config.server.maxFileSize,
  maxFilesCount: config.business.maxFilesCount,
  allowedFileExtensions: config.business.allowedFileExtensions
});

module.exports = config;
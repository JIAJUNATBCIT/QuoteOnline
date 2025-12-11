const express = require('express');
const router = express.Router();
const config = require('../config/config');
const logger = require('../utils/logger');

// 获取前端配置
router.get('/frontend', (req, res) => {
  try {
    const frontendConfig = config.getFrontendConfig();
    
    logger.info('前端配置已获取', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      config: {
        apiUrl: frontendConfig.apiUrl,
        frontendUrl: frontendConfig.frontendUrl
      }
    });
    
    res.json({
      success: true,
      data: frontendConfig
    });
  } catch (error) {
    logger.error('获取前端配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取配置失败'
    });
  }
});

// 获取服务器信息（仅限管理员）
router.get('/server', (req, res) => {
  try {
    const serverInfo = {
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      config: {
        frontendUrl: config.frontend.url,
        apiUrl: config.frontend.apiUrl,
        uploadUrl: config.frontend.uploadUrl,
        maxFileSize: config.server.maxFileSize,
        corsOrigins: config.cors.origins
      }
    };
    
    logger.info('服务器配置信息已获取', {
      ip: req.ip,
      environment: serverInfo.environment
    });
    
    res.json({
      success: true,
      data: serverInfo
    });
  } catch (error) {
    logger.error('获取服务器配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取配置失败'
    });
  }
});

module.exports = router;

const logger = require('../utils/logger');

/**
 * 邮件发送降级服务
 * 当邮件服务不可用时提供降级策略
 */
class EmailFallbackService {
  constructor() {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.isServiceDown = false;
    this.cooldownPeriod = 5 * 60 * 1000; // 5分钟冷却期
    this.maxFailures = 3; // 最大失败次数
  }

  /**
   * 记录邮件发送失败
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.maxFailures) {
      this.isServiceDown = true;
      logger.warn('邮件服务已降级', { 
        failureCount: this.failureCount,
        cooldownMinutes: this.cooldownPeriod / 1000 / 60
      });
    }
  }

  /**
   * 记录邮件发送成功
   */
  recordSuccess() {
    this.failureCount = 0;
    this.isServiceDown = false;
    this.lastFailureTime = null;
  }

  /**
   * 检查是否应该跳过邮件发送
   */
  shouldSkipEmail() {
    if (!this.isServiceDown) return false;
    
    const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
    return timeSinceLastFailure < this.cooldownPeriod;
  }

  /**
   * 尝试重置邮件服务状态
   */
  tryResetService() {
    if (this.isServiceDown && this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.cooldownPeriod) {
        this.isServiceDown = false;
        this.failureCount = 0;
        this.lastFailureTime = null;
        logger.info('邮件服务已恢复正常');
        return true;
      }
    }
    return false;
  }

  /**
   * 安全发送邮件（带降级策略）
   */
  async safeSendEmail(emailFunction, ...args) {
    // 检查是否应该跳过
    if (this.shouldSkipEmail()) {
      logger.warn('邮件服务降级中，跳过邮件发送');
      return { skipped: true, reason: 'service_down' };
    }

    try {
      const result = await emailFunction(...args);
      this.recordSuccess();
      return { success: true, result };
    } catch (error) {
      this.recordFailure();
      
      if (this.isServiceDown) {
        logger.error('邮件发送失败，服务已降级', { 
          error: error.message,
          failureCount: this.failureCount
        });
      }
      
      throw error;
    }
  }
}

module.exports = new EmailFallbackService();

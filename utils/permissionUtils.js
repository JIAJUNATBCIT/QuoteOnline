/**
 * 权限检查工具类
 * 统一前后端权限检查逻辑
 */

const User = require('../models/User');

class PermissionUtils {
  
  /**
   * 根据用户角色过滤询价单数据（后端使用）
   * @param {Object} quote 原始询价单对象
   * @param {string} userRole 用户角色
   * @returns {Object} 过滤后的询价单对象
   */
  static filterQuoteData(quote, userRole) {
    const quoteObj = quote.toObject ? quote.toObject() : quote;
    
    switch (userRole) {
      case 'customer':
        delete quoteObj.quoter;
        delete quoteObj.supplier;
        delete quoteObj.supplierFiles;
        if (quoteObj.status !== 'quoted') {
          delete quoteObj.quoterFiles;
        }
        break;
      case 'supplier':
        delete quoteObj.quoter;
        delete quoteObj.quoterFiles;
        break;
      case 'quoter':
        // 报价员可以看到所有信息
        break;
      // admin 可以看到所有信息
    }
    
    return quoteObj;
  }

  /**
   * 检查用户是否可以查看询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @param {Array} userCustomerGroupIds 用户当前客户群组ID数组
   * @returns {boolean} 是否可以查看
   */
  static canViewQuote(quote, user, userCustomerGroupIds = null) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        // 获取用户的客户群组IDs
        if (!userCustomerGroupIds) {
          userCustomerGroupIds = user.customerGroups ? user.customerGroups.map(id => id.toString()) : [];
        }
        
        // 检查是否是询价单的创建者
        if (quote.customer._id?.toString() === user.userId?.toString() || 
            quote.customer?.toString() === user.userId?.toString()) {
          return true;
        }
        
        // 检查询价单的customerGroups是否与用户的customerGroups有交集
        if (quote.customerGroups && quote.customerGroups.length > 0 && userCustomerGroupIds.length > 0) {
          return quote.customerGroups.some(groupId => {
            return userCustomerGroupIds.includes(groupId.toString());
          });
        }
        
        return false;
      case 'supplier':
        return quote.supplier?._id?.toString() === user.userId?.toString() || 
               quote.supplier?.toString() === user.userId?.toString() || 
               ['pending', 'rejected', 'in_progress'].includes(quote.status);
      case 'quoter':
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查客户是否可以查看询价单
   * 客户可以查看：自己创建的询价单或与自己customerGroups有交集的询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以查看
   */
  static canCustomerViewQuote(quote, user) {
    if (!user || user.role !== 'customer') return false;
    
    // 获取用户ID（兼容不同的用户对象格式）
    const userId = user._id?.toString() || user.userId?.toString();
    
    // 检查是否是询价单的创建者
    // 处理quote.customer的不同格式：可能是对象（包含_id）或字符串ID
    let customerId;
    if (quote.customer && typeof quote.customer === 'object' && quote.customer !== null) {
      customerId = quote.customer._id ? quote.customer._id.toString() : quote.customer.toString();
    } else {
      customerId = quote.customer?.toString();
    }
    
    if (customerId === userId) {
      return true;
    }
    
    // 检查询价单的customerGroups是否与用户的customerGroups有交集
    const userCustomerGroupIds = user.customerGroups ? user.customerGroups.map(id => id.toString()) : [];
    
    if (quote.customerGroups && quote.customerGroups.length > 0 && userCustomerGroupIds.length > 0) {
      return quote.customerGroups.some(group => {
        // 处理不同的group格式：可能是对象（包含_id）或字符串ID
        let groupId;
        if (typeof group === 'object' && group !== null) {
          groupId = group._id ? group._id.toString() : group.toString();
        } else {
          groupId = group.toString();
        }
        return userCustomerGroupIds.includes(groupId);
      });
    }
    
    return false;
  }

  /**
   * 检查用户是否可以编辑询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以编辑
   */
  static canEditQuote(quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id?.toString() === user.userId?.toString() || 
               quote.customer?.toString() === user.userId?.toString();
      case 'supplier':
        return (quote.status === 'supplier_quoted' && quote.supplier && 
                (quote.supplier._id?.toString() === user.userId?.toString() || 
                 quote.supplier?.toString() === user.userId?.toString())) ||
               (quote.status === 'rejected' && quote.supplier && 
                (quote.supplier._id?.toString() === user.userId?.toString() || 
                 quote.supplier?.toString() === user.userId?.toString()));
      case 'quoter':
        return ['pending', 'supplier_quoted', 'in_progress'].includes(quote.status);
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以删除询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以删除
   */
  static canDeleteQuote(quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id?.toString() === user.userId?.toString() || 
               quote.customer?.toString() === user.userId?.toString();
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以拒绝询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以拒绝
   */
  static canRejectQuote(quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return false;
      case 'supplier':
        return quote.supplier && 
               (quote.supplier._id?.toString() === user.userId?.toString() || 
                quote.supplier?.toString() === user.userId?.toString());
      case 'quoter':
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以删除文件
   * @param {string} fileType 文件类型
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以删除
   */
  static canDeleteFile(fileType, quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return fileType === 'customer' && 
               (quote.customer._id?.toString() === user.userId?.toString() || 
                quote.customer?.toString() === user.userId?.toString()) &&
               quote.status === 'pending';
      case 'supplier':
        // 供应商可以在最终报价前删除自己上传的文件
        return fileType === 'supplier' && 
               quote.supplier && 
               (quote.supplier._id?.toString() === user.userId?.toString() || 
                quote.supplier?.toString() === user.userId?.toString()) &&
               ['in_progress', 'rejected', 'supplier_quoted'].includes(quote.status);
      case 'quoter':
        return fileType === 'quoter' && ['quoter', 'admin'].includes(user.role);
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否具有指定角色（中间件函数）
   * @param {string|Array} roles 允许的角色或角色数组
   * @returns {Function} Express 中间件函数
   */
  static hasRole(roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: '未授权访问' });
      }

      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      
      if (allowedRoles.includes(req.user.role)) {
        next();
      } else {
        res.status(403).json({ message: '权限不足' });
      }
    };
  }
}

module.exports = PermissionUtils;
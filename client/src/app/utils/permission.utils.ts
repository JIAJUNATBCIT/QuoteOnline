/**
 * 权限检查工具类
 * 统一前后端权限检查逻辑
 */

import { User } from "./user.types";

export class PermissionUtils {
  
  /**
   * 检查用户是否可以查看询价单
   * @param quote 询价单对象
   * @param user 用户对象
   * @returns 是否可以查看
   */
  static canViewQuote(quote: any, user: any): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        const userId = user._id;
        return quote.customer._id === userId || quote.customer === userId;
      case 'supplier':
        const supplierUserId = user._id;
        return quote.supplier?._id === supplierUserId || 
               quote.supplier === supplierUserId ||
               ['pending', 'rejected', 'in_progress'].includes(quote.status);
      case 'quoter':
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以编辑询价单
   * @param quote 询价单对象
   * @param user 用户对象
   * @returns 是否可以编辑
   */
  static canEditQuote(quote: any, user: any): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        const userId = user._id;
        return quote.customer._id === userId || quote.customer === userId;
      case 'supplier':
        const supplierUserId = user._id;
        return (quote.status === 'in_progress' && quote.supplier && 
                (quote.supplier._id === supplierUserId || quote.supplier === supplierUserId)) ||
               (quote.status === 'rejected' && quote.supplier && 
                (quote.supplier._id === supplierUserId || quote.supplier === supplierUserId));
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
   * @param quote 询价单对象
   * @param user 用户对象
   * @returns 是否可以删除
   */
  static canDeleteQuote(quote: any, user: any): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        const userId = user._id;
        return quote.customer._id === userId || quote.customer === userId;
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以拒绝询价单
   * @param quote 询价单对象
   * @param user 用户对象
   * @returns 是否可以拒绝
   */
  static canRejectQuote(user: User): boolean {
    if (!user) return false;
    return user.role === 'quoter' || user.role === 'admin';
  }

  /**
   * 根据用户角色过滤询价单数据（后端使用）
   * @param quote 原始询价单对象
   * @param userRole 用户角色
   * @returns 过滤后的询价单对象
   */
  static filterQuoteData(quote: any, userRole: string): any {
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
   * 检查用户是否可以删除文件
   * @param fileType 文件类型
   * @param quote 询价单对象
   * @param user 用户对象
   * @returns 是否可以删除
   */
  static canDeleteFile(fileType: string, quote: any, user: any): boolean {
    if (!user) return false;
    switch (user.role) {
      case 'customer':
        const fileUserId = user._id;
        return fileType === 'customer' && 
               (quote.customer._id === fileUserId || quote.customer === fileUserId) &&
               quote.status === 'pending';
      case 'supplier':
        // 供应商可以在最终报价前删除自己上传的文件
        const fileSupplierUserId = user._id;
        return fileType === 'supplier' && 
               quote.supplier && (quote.supplier._id === fileSupplierUserId || quote.supplier === fileSupplierUserId) &&
               ['in_progress', 'rejected', 'supplier_quoted'].includes(quote.status);
      case 'quoter':
        return fileType === 'quoter' && ['quoter', 'admin'].includes(user.role);
      case 'admin':
        return true;
      default:
        return false;
    }
  }
}
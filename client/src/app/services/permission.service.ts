import { Injectable } from '@angular/core';
import { Quote } from './quote.service';
import { User } from '../utils/user.types';
import { PermissionUtils } from '../utils/permission.utils';

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  
  // 检查用户是否可以查看询价单
  canViewQuote(quote: Quote, user: User): boolean {
    return PermissionUtils.canViewQuote(quote, user);
  }
  
  // 检查用户是否可以编辑询价单
  canEditQuote(quote: Quote, user: User): boolean {
    return PermissionUtils.canEditQuote(quote, user);
  }

  // 检查用户是否可以删除询价单
  canDeleteQuote(quote: Quote, user: User): boolean {
    return PermissionUtils.canDeleteQuote(quote, user);
  }

  // 检查用户是否可以拒绝询价单
  canRejectQuote(user: User): boolean {
    return PermissionUtils.canRejectQuote(user);
  }

  // 检查用户是否可以删除文件
  canDeleteFile(quote: Quote, fileType: string, user: User): boolean {
    return PermissionUtils.canDeleteFile(fileType, quote, user);
  }

  // 检查用户是否可以分配询价单
  canAssignQuote(user: User): boolean {
    return user?.role === 'admin';
  }

  // 检查用户是否可以上传供应商文件
  canUploadSupplierFile(quote: Quote, user: User): boolean {
    return user?.role === 'supplier' && 
           ['in_progress', 'rejected', 'supplier_quoted'].includes(quote.status) &&
           quote.supplier && (quote.supplier._id === user._id || quote.supplier === user._id);
  }

  // 检查用户是否可以上传最终报价文件
  canUploadFinalQuote(quote: Quote, user: User): boolean {
    return (user?.role === 'quoter' || user?.role === 'admin') && 
           ['pending', 'supplier_quoted', 'in_progress'].includes(quote.status);
  }

  // 检查用户是否可以下载文件
  canDownloadFile(quote: Quote, fileType: string, user: User): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        const downloadUserId = user._id;
        if (fileType === 'customer') {
          return quote.customer._id === downloadUserId || quote.customer === downloadUserId;
        }
        if (fileType === 'quoter') {
          return quote.status === 'quoted' && 
                 (quote.customer._id === downloadUserId || quote.customer === downloadUserId);
        }
        return false; // 客户永远不能下载供应商文件
      case 'supplier':
        // 供应商可以下载：1. 待处理的询价单的客户文件 2. 自己已报价的询价单的客户文件 3. 自己上传的供应商文件
        const downloadSupplierUserId = user._id;
        return (fileType === 'customer' && 
                (quote.status === 'pending' || 
                 (quote.supplier && (quote.supplier._id === downloadSupplierUserId || quote.supplier === downloadSupplierUserId)))) ||
               (fileType === 'supplier' && 
                quote.supplier && (quote.supplier._id === downloadSupplierUserId || quote.supplier === downloadSupplierUserId));
      case 'quoter':
      case 'admin':
        return true; // 报价员和管理员可以下载所有文件
      default:
        return false;
    }
  }
}
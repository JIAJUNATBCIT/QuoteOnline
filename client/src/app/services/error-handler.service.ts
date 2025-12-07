import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError, Observable } from 'rxjs';

export interface ErrorInfo {
  message: string;
  statusCode?: number;
  timestamp: Date;
  url?: string;
  details?: any;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  
  private errors: ErrorInfo[] = [];
  private maxErrors = 100;

  constructor() { }

  handleError(error: any): Observable<never> {
    const errorInfo = this.createErrorInfo(error);
    this.logError(errorInfo);
    this.storeError(errorInfo);
    
    return throwError(() => errorInfo);
  }

  private createErrorInfo(error: any): ErrorInfo {
    if (error instanceof HttpErrorResponse) {
      return {
        message: this.getHttpErrorMessage(error),
        statusCode: error.status,
        timestamp: new Date(),
        url: error.url || undefined,
        details: error.error
      };
    } else if (error instanceof Error) {
      return {
        message: error.message,
        timestamp: new Date(),
        details: error.stack
      };
    } else {
      return {
        message: typeof error === 'string' ? error : '未知错误',
        timestamp: new Date(),
        details: error
      };
    }
  }

  private getHttpErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return '网络连接失败，请检查网络设置';
    }
    
    switch (error.status) {
      case 400:
        return '请求参数错误';
      case 401:
        return '未授权，请重新登录';
      case 403:
        return '权限不足';
      case 404:
        return '请求的资源不存在';
      case 429:
        return '请求过于频繁，请稍后再试';
      case 500:
        return '服务器内部错误';
      case 502:
        return '服务器网关错误';
      case 503:
        return '服务暂时不可用';
      default:
        return error.error?.message || error.message || `HTTP错误: ${error.status}`;
    }
  }

  private logError(errorInfo: ErrorInfo): void {
    console.group(`🚨 错误发生 [${errorInfo.timestamp.toISOString()}]`);
    console.error('消息:', errorInfo.message);
    if (errorInfo.statusCode) {
      console.error('状态码:', errorInfo.statusCode);
    }
    if (errorInfo.url) {
      console.error('URL:', errorInfo.url);
    }
    if (errorInfo.details) {
      console.error('详情:', errorInfo.details);
    }
    console.groupEnd();
  }

  private storeError(errorInfo: ErrorInfo): void {
    this.errors.unshift(errorInfo);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }
  }

  getStoredErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  clearStoredErrors(): void {
    this.errors = [];
  }

  getErrorSummary(): { total: number; byStatus: Record<number, number> } {
    const summary = {
      total: this.errors.length,
      byStatus: {} as Record<number, number>
    };

    this.errors.forEach(error => {
      if (error.statusCode) {
        summary.byStatus[error.statusCode] = (summary.byStatus[error.statusCode] || 0) + 1;
      }
    });

    return summary;
  }
}
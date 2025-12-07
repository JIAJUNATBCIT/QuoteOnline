import { ErrorHandler, Injectable } from '@angular/core';
import { ErrorHandlerService } from './services/error-handler.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private errorHandlerService: ErrorHandlerService) {}

  handleError(error: any): void {
    // 使用我们的错误处理服务
    this.errorHandlerService.handleError(error).subscribe({
      error: (errorInfo) => {
        // 可以在这里添加额外的全局错误处理逻辑
        // 比如发送错误报告到监控服务
        this.reportError(errorInfo);
      }
    });
  }

  private reportError(errorInfo: any): void {
    // 这里可以集成错误监控服务
    // 例如 Sentry, LogRocket 等
    console.warn('🚨 全局错误报告:', errorInfo);
  }
}
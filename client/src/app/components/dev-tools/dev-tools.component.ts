import { Component, OnInit, OnDestroy } from '@angular/core';
import { ErrorHandlerService, ErrorInfo } from '../../services/error-handler.service';
import { AuthService } from '../../services/auth.service';
import { TokenService } from '../../services/token.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dev-tools',
  templateUrl: './dev-tools.component.html',
  styleUrls: ['./dev-tools.component.scss']
})
export class DevToolsComponent implements OnInit, OnDestroy {
  errors: ErrorInfo[] = [];
  errorSummary: { total: number; byStatus: Record<number, number> } = { total: 0, byStatus: {} };
  isExpanded = false;
  
  // Make Object accessible in template
  Object = Object;
  
  // Token 信息
  tokenInfo = {
    accessToken: null as string | null,
    refreshToken: null as string | null,
    tokenExpiry: null as Date | null,
    refreshThreshold: 0,
    checkInterval: 0
  };

  // 用户信息
  userInfo = {
    isLoggedIn: false,
    user: null as any,
    lastCheck: null as Date | null
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private errorHandler: ErrorHandlerService,
    private authService: AuthService,
    private tokenService: TokenService
  ) {}

  ngOnInit(): void {
    this.loadErrorInfo();
    this.loadTokenInfo();
    this.loadUserInfo();
    
    // 定期更新信息
    const interval = setInterval(() => {
      this.loadTokenInfo();
      this.loadUserInfo();
    }, 5000);
    
    // 使用任何类型来避免Subscription类型检查问题
    const subscription = { unsubscribe: () => clearInterval(interval) } as any;
    this.subscriptions.push(subscription);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadErrorInfo(): void {
    this.errors = this.errorHandler.getStoredErrors();
    this.errorSummary = this.errorHandler.getErrorSummary();
  }

  loadTokenInfo(): void {
    this.tokenInfo.accessToken = this.tokenService.getAccessToken();
    this.tokenInfo.refreshToken = this.tokenService.getRefreshToken();
    this.tokenInfo.tokenExpiry = this.tokenService.getTokenExpiry();
    this.tokenInfo.refreshThreshold = 5; // 5分钟
    this.tokenInfo.checkInterval = 1; // 1分钟
  }

  loadUserInfo(): void {
    this.userInfo.isLoggedIn = this.authService.isLoggedIn();
    if (this.userInfo.isLoggedIn) {
      this.userInfo.user = this.authService.getCurrentUser();
    }
    this.userInfo.lastCheck = new Date();
  }

  clearErrors(): void {
    this.errorHandler.clearStoredErrors();
    this.loadErrorInfo();
  }

  copyErrorToClipboard(error: ErrorInfo): void {
    const errorText = JSON.stringify(error, null, 2);
    navigator.clipboard.writeText(errorText).then(() => {
      console.log('错误信息已复制到剪贴板');
    });
  }

  refreshTokens(): void {
    this.tokenService.refreshToken().subscribe({
      next: () => {
        this.loadTokenInfo();
        console.log('Token 刷新成功');
      },
      error: (error) => {
        console.error('Token 刷新失败:', error);
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.loadUserInfo();
    this.loadTokenInfo();
  }

  get isProduction(): boolean {
    return window.location.hostname !== 'localhost';
  }

  get tokenStatus(): 'valid' | 'expiring' | 'expired' {
    if (!this.tokenInfo.tokenExpiry) return 'expired';
    
    const now = new Date();
    const timeToExpiry = this.tokenInfo.tokenExpiry.getTime() - now.getTime();
    const thresholdMinutes = this.tokenInfo.refreshThreshold * 60 * 1000;
    
    if (timeToExpiry <= 0) return 'expired';
    if (timeToExpiry <= thresholdMinutes) return 'expiring';
    return 'valid';
  }

  getTokenStatusText(): string {
    switch (this.tokenStatus) {
      case 'valid': return '有效';
      case 'expiring': return '即将过期';
      case 'expired': return '已过期';
      default: return '未知';
    }
  }

  // 检查用户是否为管理员
  get isAdmin(): boolean {
    if (!this.userInfo.isLoggedIn || !this.userInfo.user) {
      return false;
    }
    return this.userInfo.user.role === 'admin' || this.userInfo.user.role === 'administrator';
  }
}
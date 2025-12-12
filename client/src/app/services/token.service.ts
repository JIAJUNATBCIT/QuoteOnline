import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, timer, fromEvent, of } from 'rxjs';
import { switchMap, catchError, take, startWith } from 'rxjs/operators';

import { TokenResponse } from '../utils/user.types';
import { environment } from '../../../environment';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private readonly ACCESS_TOKEN_KEY = 'access_token';
  private readonly ACCESS_TOKEN_EXPIRY_KEY = 'access_token_expiry';
  private readonly REFRESH_THRESHOLD = 5 * 60 * 1000; // 5分钟前刷新
  private readonly TOKEN_REFRESH_INTERVAL = 60 * 1000; // 每分钟检查一次
  
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  constructor(
    private http: HttpClient
  ) {
    // 延迟初始化定时器，避免在构造函数中立即执行
    setTimeout(() => {
      this.startTokenRefreshTimer();
      this.setupVisibilityChangeListener();
    }, 1000);
  }

  // 获取 access token
  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  // 获取 refresh token
  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  // 获取 token 过期时间
  getTokenExpiry(): Date | null {
    const expiry = this.getAccessTokenExpiry();
    return expiry ? new Date(expiry) : null;
  }

  // 设置 access token
  setAccessToken(token: string, expiresIn: number = 30 * 60): void { // 默认30分钟
    const expiryTime = Date.now() + (expiresIn * 1000);
    localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
    localStorage.setItem(this.ACCESS_TOKEN_EXPIRY_KEY, expiryTime.toString());
  }

  // 获取 access token 过期时间
  getAccessTokenExpiry(): number | null {
    const expiry = localStorage.getItem(this.ACCESS_TOKEN_EXPIRY_KEY);
    return expiry ? parseInt(expiry) : null;
  }

  // 检查 access token 是否即将过期
  isTokenExpiringSoon(): boolean {
    const expiry = this.getAccessTokenExpiry();
    if (!expiry) return true;
    
    return Date.now() >= (expiry - this.REFRESH_THRESHOLD);
  }

  // 检查 access token 是否已过期
  isTokenExpired(): boolean {
    const expiry = this.getAccessTokenExpiry();
    if (!expiry) return true;
    
    return Date.now() >= expiry;
  }

  // 刷新 token
  refreshToken(): Observable<TokenResponse> {
    if (this.isRefreshing) {
      return this.refreshTokenSubject.asObservable().pipe(
        take(1),
        switchMap(token => {
          if (token) {
            return of({ accessToken: token, refreshToken: '' } as TokenResponse);
          }
          return this.performTokenRefresh();
        })
      );
    }

    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);

    return this.performTokenRefresh().pipe(
      catchError(error => {
        this.isRefreshing = false;
        this.refreshTokenSubject.next(null);
        this.clearTokens();
        throw error;
      })
    );
  }

  private performTokenRefresh(): Observable<TokenResponse> {
    // 创建一个自定义的请求，避免被拦截器拦截
    const headers = { 
      'Content-Type': 'application/json',
      'X-Skip-Interceptor': 'true' // 添加自定义头部标识
    };
    
    const url = `${environment.apiUrl}/auth/refresh`;
    return this.http.post<TokenResponse>(url, {}, { headers }).pipe(
      switchMap((response: TokenResponse) => {
        this.isRefreshing = false;
        this.setAccessToken(response.accessToken);
        this.refreshTokenSubject.next(response.accessToken);
        return of(response);
      })
    );
  }

  // 清除所有 token
  clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.ACCESS_TOKEN_EXPIRY_KEY);
    this.refreshTokenSubject.next(null);
    this.isRefreshing = false;
  }

  // 获取刷新 token 的 observable
  getRefreshTokenObservable(): Observable<string | null> {
    return this.refreshTokenSubject.asObservable();
  }

  // 启动 token 刷新定时器
  private startTokenRefreshTimer(): void {
    timer(0, this.TOKEN_REFRESH_INTERVAL).pipe(
      switchMap(() => {
        if (this.getAccessToken() && this.isTokenExpiringSoon() && !this.isRefreshing) {
          return this.refreshToken().pipe(
            catchError(() => of(null))
          );
        }
        return of(null);
      })
    ).subscribe();
  }

  // 监听页面可见性变化，页面重新激活时检查 token
  private setupVisibilityChangeListener(): void {
    fromEvent(document, 'visibilitychange').pipe(
      startWith(null)
    ).subscribe(() => {
      if (!document.hidden && this.getAccessToken() && this.isTokenExpired() && !this.isRefreshing) {
        this.refreshToken().pipe(
          catchError(() => of(null))
        ).subscribe();
      }
    });
  }

  // 检查是否正在刷新 token
  get isTokenRefreshing(): boolean {
    return this.isRefreshing;
  }
}
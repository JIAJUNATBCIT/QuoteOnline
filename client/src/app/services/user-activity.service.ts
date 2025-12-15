import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, timer } from 'rxjs';
import { switchMap, debounceTime } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class UserActivityService {
  private readonly INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30分钟无活动
  private readonly CHECK_INTERVAL = 60 * 1000; // 每分钟检查一次
  
  private lastActivity = new BehaviorSubject<number>(Date.now());
  private isUserActive = new BehaviorSubject<boolean>(true);
  
  constructor() {
    this.startActivityMonitoring();
  }

  /**
   * 开始监听用户活动
   */
  private startActivityMonitoring(): void {
    // 监听用户活动事件
    const activityEvents = [
      'mousedown', 'mousemove', 'keypress',
      'scroll', 'touchstart', 'click'
    ];

    activityEvents.forEach(eventName => {
      fromEvent(document, eventName).subscribe(() => {
        this.recordActivity();
      });
    });

    // 页面可见性变化
    fromEvent(document, 'visibilitychange').subscribe(() => {
      if (!document.hidden) {
        this.recordActivity();
      }
    });

    // 定期检查用户活动状态
    timer(0, this.CHECK_INTERVAL).pipe(
      switchMap(async () => this.checkActivity())
    ).subscribe();
  }

  /**
   * 记录用户活动
   */
  private recordActivity(): void {
    this.lastActivity.next(Date.now());
    if (!this.isUserActive.value) {
      this.isUserActive.next(true);
    }
  }

  /**
   * 检查用户活动状态
   */
  private checkActivity(): void {
    const timeSinceLastActivity = Date.now() - this.lastActivity.value;
    const wasActive = this.isUserActive.value;
    const isActive = timeSinceLastActivity < this.INACTIVITY_TIMEOUT;

    if (wasActive !== isActive) {
      this.isUserActive.next(isActive);
      
      if (!isActive) {
        console.log('用户长时间无活动，准备登出');
        this.triggerAutoLogout();
      }
    }
  }

  /**
   * 触发自动登出
   */
  private triggerAutoLogout(): void {
    // 发送登出事件
    window.dispatchEvent(new CustomEvent('userAutoLogout'));
  }

  /**
   * 获取用户活动状态
   */
  getUserActivity(): BehaviorSubject<boolean> {
    return this.isUserActive;
  }

  /**
   * 手动重置活动计时器
   */
  resetActivityTimer(): void {
    this.recordActivity();
  }

  /**
   * 获取距离自动登出的剩余时间
   */
  getTimeUntilLogout(): number {
    const elapsed = Date.now() - this.lastActivity.value;
    return Math.max(0, this.INACTIVITY_TIMEOUT - elapsed);
  }
}

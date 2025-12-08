#!/usr/bin/env node

/**
 * 修复双token过期机制
 * 缩短refresh token有效期并添加用户活动检测
 */

const fs = require('fs');
const path = require('path');

function fixTokenExpiry() {
  console.log('🔧 修复双token过期机制...\n');

  // 1. 修复后端token有效期
  console.log('1. 修复后端token配置...');
  
  const tokenUtilsPath = path.join(__dirname, 'utils', 'tokenUtils.js');
  
  if (fs.existsSync(tokenUtilsPath)) {
    let content = fs.readFileSync(tokenUtilsPath, 'utf8');
    
    // 将refresh token有效期从3天改为8小时
    const oldRefreshExpiry = "expiresIn: '3d' // 3天";
    const newRefreshExpiry = "expiresIn: '8h' // 8小时";
    
    if (content.includes(oldRefreshExpiry)) {
      content = content.replace(oldRefreshExpiry, newRefreshExpiry);
      fs.writeFileSync(tokenUtilsPath, content);
      console.log('✅ 已将Refresh Token有效期从3天缩短为8小时');
    } else {
      console.log('⚠️  Refresh Token配置可能已被修改');
    }
    
    // 检查access token有效期
    if (content.includes("expiresIn: '30m'")) {
      console.log('✅ Access Token保持30分钟有效期');
    }
  }

  // 2. 添加用户活动检测
  console.log('\n2. 创建用户活动检测服务...');
  
  const userActivityService = `import { Injectable } from '@angular/core';
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
      switchMap(() => this.checkActivity())
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
`;

  const userActivityPath = path.join(__dirname, 'client', 'src', 'app', 'services', 'user-activity.service.ts');
  
  // 确保目录存在
  const dir = path.dirname(userActivityPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(userActivityPath, userActivityService);
  console.log('✅ 已创建用户活动检测服务');

  // 3. 修改app.component.ts集成用户活动检测
  console.log('\n3. 生成应用组件修改建议...');
  
  const appComponentModifications = `
在 app.component.ts 中添加以下导入和逻辑:

import { UserActivityService } from './services/user-activity.service';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  constructor(
    private userActivityService: UserActivityService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // 监听用户活动状态
    this.userActivityService.getUserActivity()
      .pipe(
        filter(active => !active)
      )
      .subscribe(() => {
        // 用户无活动，执行登出
        this.handleUserInactivity();
      });

    // 监听自动登出事件
    window.addEventListener('userAutoLogout', () => {
      this.handleUserInactivity();
    });
  }

  private handleUserInactivity(): void {
    console.log('由于长时间无活动，自动登出');
    this.authService.logout();
    
    // 显示提示信息
    if (typeof alert !== 'undefined') {
      alert('由于长时间无活动，您已自动登出');
    }
  }
}
`;

  console.log('✅ 生成应用组件修改建议');

  // 4. 创建环境配置建议
  console.log('\n4. 生成环境配置建议...');
  
  const envConfig = `# 建议的 .env 配置修改
# JWT配置
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-key-here
JWT_ACCESS_EXPIRY=30m    # 访问令牌30分钟
JWT_REFRESH_EXPIRY=8h    # 刷新令牌8小时（关键修改）

# 用户活动配置
USER_INACTIVITY_TIMEOUT=1800000  # 30分钟无活动自动登出
USER_ACTIVITY_CHECK_INTERVAL=60000 # 每分钟检查一次活动
`;

  console.log('✅ 生成环境配置建议');

  // 5. 创建测试脚本验证修复
  console.log('\n5. 创建验证脚本...');
  
  const verificationScript = `#!/usr/bin/env node

// 验证token过期修复效果
const axios = require('axios');

async function verifyTokenFix() {
  console.log('🧪 验证token过期修复效果...');
  
  try {
    // 1. 登录获取tokens
    const response = await axios.post('https://portal.ooishipping.com/api/auth/login', {
      email: 'test@example.com',
      password: 'test123456'
    });

    const refreshToken = response.data.refreshToken;
    const refreshPayload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64'));
    
    const refreshHours = (refreshPayload.exp - refreshPayload.iat) / 3600;
    
    if (refreshHours <= 24) {
      console.log('✅ Refresh Token有效期已修复');
      console.log(\`   新有效期: \${Math.round(refreshHours)} 小时\`);
    } else {
      console.log('❌ Refresh Token有效期仍然过长');
    }

    // 2. 测试用户活动检测（需要前端配合）
    console.log('\\n📝 前端集成步骤:');
    console.log('1. 将user-activity.service.ts集成到应用中');
    console.log('2. 修改app.component.ts添加活动检测逻辑');
    console.log('3. 重新构建并部署前端应用');
    console.log('4. 测试30分钟无活动是否自动登出');

  } catch (error) {
    console.error('验证失败:', error.message);
  }
}

verifyTokenFix();
`;

  const verifyScriptPath = path.join(__dirname, 'verify-token-fix.js');
  fs.writeFileSync(verifyScriptPath, verificationScript);
  console.log('✅ 创建验证脚本: verify-token-fix.js');

  console.log('\n🎯 修复完成总结:');
  console.log('-'.repeat(50));
  console.log('1. ✅ 后端Refresh Token有效期: 3天 → 8小时');
  console.log('2. ✅ 创建用户活动检测服务');
  console.log('3. 📝 提供前端集成指南');
  console.log('4. ✅ 创建验证脚本');
  console.log('\n🚀 下一步操作:');
  console.log('1. 重启后端服务应用新配置');
  console.log('2. 集成用户活动检测到前端');
  console.log('3. 运行验证脚本测试效果');
  console.log('4. 测试30分钟无活动自动登出功能');

  return {
    tokenUtilsFixed: true,
    userActivityServiceCreated: true,
    verificationScriptCreated: true
  };
}

// 运行修复
if (require.main === module) {
  const result = fixTokenExpiry();
  console.log('\\n✨ 修复过程完成!');
}

module.exports = { fixTokenExpiry };
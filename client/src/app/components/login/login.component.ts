import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  loading = false;
  error = '';
  returnUrl: string = '/dashboard';

  constructor(
    private formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });

    // 获取查询参数中的 returnUrl
    this.route.queryParams.subscribe(params => {
      this.returnUrl = params['returnUrl'] || '/dashboard';
      console.log('Login component - returnUrl:', this.returnUrl); // 调试日志
      console.log('Login component - current URL:', this.router.url);
      console.log('Login component - all queryParams:', params);
    });
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = '';

    console.log('Login - Attempting login, returnUrl will be:', this.returnUrl);

    this.authService.login(
      this.loginForm.get('email')?.value,
      this.loginForm.get('password')?.value
    ).subscribe({
      next: () => {
        console.log('Login - Success, navigating to:', this.returnUrl);
        console.log('Login - Current user after login:', this.authService.getCurrentUser());
        
        // 添加小延迟确保状态完全更新
        setTimeout(() => {
          console.log('Login - After timeout, navigating to:', this.returnUrl);
          // 使用 navigateByUrl 确保完整路径跳转
          this.router.navigateByUrl(this.returnUrl);
        }, 100);
      },
      error: (error) => {
        console.error('Login - Error:', error);
        this.error = error.error?.message || '登录失败';
        this.loading = false;
      }
    });
  }

  showForgotPassword() {
    const email = this.loginForm.get('email')?.value;
    if (email) {
      // 如果用户已经输入了邮箱，直接跳转到重置密码页面并预填邮箱
      this.router.navigate(['/forgot-password'], { queryParams: { email } });
    } else {
      // 否则跳转到重置密码页面
      this.router.navigate(['/forgot-password']);
    }
  }
}
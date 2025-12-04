import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent implements OnInit {
  forgotPasswordForm!: FormGroup;
  loading = false;
  success = '';
  error = '';

  constructor(
    private formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.forgotPasswordForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]]
    });

    // 如果从登录页面传递了邮箱参数，预填邮箱
    this.route.queryParams.subscribe(params => {
      if (params['email']) {
        this.forgotPasswordForm.patchValue({ email: params['email'] });
      }
    });
  }

  onSubmit() {
    if (this.forgotPasswordForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.authService.forgotPassword(this.forgotPasswordForm.get('email')?.value)
      .subscribe({
        next: (response) => {
          this.success = response.message || '密码重置链接已发送到您的邮箱';
          this.loading = false;
        },
        error: (error) => {
          this.error = error.error?.message || '发送重置链接失败';
          this.loading = false;
        }
      });
  }

  backToLogin() {
    this.router.navigate(['/login']);
  }
}
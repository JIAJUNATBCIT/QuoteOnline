import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss']
})
export class UserProfileComponent implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;
  loading = false;
  error = '';
  success = '';

  constructor(
    private formBuilder: FormBuilder,
    private userService: UserService,
    public authService: AuthService
  ) {
    this.profileForm = this.formBuilder.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      company: [''],
      phone: ['', Validators.pattern(/^1[3-9]\d{9}$/)]
    });

    this.passwordForm = this.formBuilder.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit() {
    this.loadUserProfile();
  }

  loadUserProfile() {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userService.getUserById(user.id).subscribe({
        next: (userData) => {
          this.profileForm.patchValue({
            name: userData.name,
            email: userData.email,
            company: userData.company || '',
            phone: userData.phone || ''
          });
        },
        error: (error) => {
          console.error('加载用户信息失败:', error);
        }
      });
    }
  }

  onSubmit() {
    if (this.profileForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const user = this.authService.getCurrentUser();
    if (!user) return;

    this.userService.updateUserProfile(user.id, this.profileForm.value).subscribe({
      next: (updatedUser) => {
        // 更新本地存储的用户信息
        localStorage.setItem('user', JSON.stringify({
          ...user,
          name: updatedUser.name,
          company: updatedUser.company
        }));
        
        this.authService.getCurrentUser(); // 触发更新
        this.success = '个人信息更新成功';
        this.loading = false;
      },
      error: (error) => {
        this.error = error.error?.message || '更新失败';
        this.loading = false;
      }
    });
  }

  getRoleDisplayName(role: string): string {
    const roleNames: { [key: string]: string } = {
      'customer': '客户',
      'quoter': '报价员',
      'admin': '管理员'
    };
    return roleNames[role] || role;
  }

  // 密码匹配验证器
  passwordMatchValidator(form: FormGroup) {
    const newPassword = form.get('newPassword')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  // 密码修改提交
  onPasswordSubmit() {
    if (this.passwordForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const user = this.authService.getCurrentUser();
    if (!user) return;

    const passwordData = {
      currentPassword: this.passwordForm.get('currentPassword')?.value,
      newPassword: this.passwordForm.get('newPassword')?.value
    };

    this.userService.changePassword(user.id, passwordData).subscribe({
      next: () => {
        this.success = '密码修改成功';
        this.passwordForm.reset();
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || '密码修改失败';
        this.loading = false;
      }
    });
  }
}
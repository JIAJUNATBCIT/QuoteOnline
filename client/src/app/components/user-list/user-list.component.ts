import { Component, OnInit } from '@angular/core';
import { UserService, User } from '../../services/user.service';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss']
})
export class UserListComponent implements OnInit {
  users: User[] = [];
  loading = true;
  error = '';
  currentUserId: string | null = null;

  constructor(private userService: UserService) { }

  ngOnInit() {
    // 从localStorage获取用户数据
    const userStr = localStorage.getItem('user');
    
    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);
        this.currentUserId = parsedUser._id || parsedUser.id || null;
      } catch (e) {
        this.currentUserId = null;
      }
    } else {
      this.currentUserId = null;
    }
    
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
      },
      error: () => {
        this.error = '加载用户列表失败';
        this.loading = false;
      }
    });
  }

  getRoleDisplayName(role: string): string {
    const roleNames: { [key: string]: string } = {
      'customer': '客户',
      'quoter': '报价员',
      'admin': '管理员',
      'supplier': '供应商'
    };
    return roleNames[role] || role;
  }

  // 检查是否可以修改用户角色（不能修改自己的角色）
  canModifyUserRole(user: User): boolean {
    return this.currentUserId !== user._id;
  }

  updateUserRole(userId: string, newRole: string) {
    // 安全检查：不能修改自己的角色
    if (this.currentUserId === userId) {
      alert('不能修改自己的角色');
      return;
    }
    
    this.userService.updateUserRole(userId, newRole).subscribe({
      next: () => {
        this.loadUsers();
        alert('用户角色更新成功');
      },
      error: (error) => {
        console.error('更新用户角色失败:', error);
        alert('更新失败');
      }
    });
  }

  deleteUser(userId: string) {
    // 防止删除自己
    if (this.currentUserId === userId) {
      alert('不能删除自己的账户');
      return;
    }
    
    // 确认删除
    const userToDelete = this.users.find(u => u._id === userId);
    const confirmMessage = userToDelete 
      ? `确定要删除用户 "${userToDelete.name}" (${this.getRoleDisplayName(userToDelete.role)}) 吗？此操作不可恢复。`
      : '确定要删除这个用户吗？此操作不可恢复。';
    
    if (confirm(confirmMessage)) {
      this.userService.deleteUser(userId).subscribe({
        next: () => {
          this.loadUsers();
          alert('用户删除成功');
        },
        error: (error) => {
          console.error('删除用户失败:', error);
          alert('删除失败: ' + (error.error?.message || error.message || '未知错误'));
        }
      });
    }
  }

  changeUserPassword(user: User) {
    const newPassword = prompt(`请输入用户 "${user.name}" 的新密码 (至少6个字符):`);
    
    if (!newPassword) {
      return;
    }
    
    if (newPassword.length < 6) {
      alert('密码至少需要6个字符');
      return;
    }
    
    // 确认密码
    const confirmPassword = prompt('请再次输入新密码进行确认:');
    
    if (newPassword !== confirmPassword) {
      alert('两次输入的密码不一致');
      return;
    }
    
    this.userService.adminChangePassword(user._id, newPassword).subscribe({
      next: () => {
        alert(`用户 "${user.name}" 的密码修改成功`);
      },
      error: (error) => {
        console.error('修改密码失败:', error);
        alert('修改密码失败');
      }
    });
  }
}
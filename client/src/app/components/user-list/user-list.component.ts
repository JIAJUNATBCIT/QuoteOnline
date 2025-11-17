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

  constructor(private userService: UserService) { }

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
      },
      error: (error) => {
        this.error = '加载用户列表失败';
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

  updateUserRole(userId: string, newRole: string) {
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
    if (confirm('确定要删除这个用户吗？此操作不可恢复。')) {
      this.userService.deleteUser(userId).subscribe({
        next: () => {
          this.loadUsers();
          alert('用户删除成功');
        },
        error: (error) => {
          console.error('删除用户失败:', error);
          alert('删除失败');
        }
      });
    }
  }
}
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { GroupService, Group, CreateGroupData, UpdateGroupData } from '../../services/group.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-group-management',
  templateUrl: './group-management.component.html',
  styleUrls: ['./group-management.component.scss']
})
export class GroupManagementComponent implements OnInit, OnDestroy {
  groups: Group[] = [];
  loading = true;
  error = '';
  suppliers: any[] = [];
  
  // 模态框相关
  showCreateModal = false;
  showEditModal = false;
  showAssignModal = false;
  
  // 表单数据
  groupForm: CreateGroupData = {
    name: '',
    description: '',
    color: '#007bff'
  };
  
  editForm: UpdateGroupData = {};
  selectedGroup: Group | null = null;
  selectedSuppliers: string[] = [];

  private userSubscription: Subscription | null = null;

  constructor(
    private groupService: GroupService,
    private userService: UserService,
    public authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // 订阅用户状态变化
    this.userSubscription = this.authService.currentUser.subscribe(user => {
      if (user && ['admin', 'quoter'].includes(user.role)) {
        this.loadGroups();
        this.loadSuppliers();
      } else {
        this.error = '权限不足，只有管理员和报价员可以访问群组管理';
        this.loading = false;
      }
    });
    
    // 初始检查用户权限
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || !['admin', 'quoter'].includes(currentUser.role)) {
      this.error = '权限不足，只有管理员和报价员可以访问群组管理';
      this.loading = false;
    }
  }

  loadGroups() {
    this.loading = true;
    this.groupService.getAllGroups().subscribe({
      next: (groups) => {
        this.groups = groups;
        this.loading = false;
      },
      error: () => {
        this.error = '加载群组失败';
        this.loading = false;
      }
    });
  }

  loadSuppliers() {
    this.userService.getSuppliers().subscribe({
      next: (suppliers) => {
        this.suppliers = suppliers;
      },
      error: (error) => {
        console.error('加载供应商失败:', error);
      }
    });
  }

  openCreateModal() {
    this.groupForm = {
      name: '',
      description: '',
      color: '#007bff'
    };
    this.showCreateModal = true;
    this.cdr.detectChanges(); // 强制更新UI
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  createGroup() {
    if (!this.groupForm.name.trim()) {
      alert('请输入群组名称');
      return;
    }

    this.groupService.createGroup(this.groupForm).subscribe({
      next: () => {
        this.loadGroups();
        this.closeCreateModal();
        alert('群组创建成功');
      },
      error: (error) => {
        console.error('创建群组失败:', error);
        alert('创建群组失败');
      }
    });
  }

  openEditModal(group: Group) {
    this.selectedGroup = group;
    this.editForm = {
      name: group.name,
      description: group.description,
      color: group.color,
      isActive: group.isActive
    };
    this.showEditModal = true;
    this.cdr.detectChanges(); // 强制更新UI
  }

  closeEditModal() {
    this.showEditModal = false;
    this.selectedGroup = null;
    this.editForm = {};
    this.cdr.detectChanges(); // 强制更新UI
  }

  updateGroup() {
    if (!this.selectedGroup || !this.editForm.name?.trim()) {
      alert('请输入群组名称');
      return;
    }

    this.groupService.updateGroup(this.selectedGroup._id, this.editForm).subscribe({
      next: () => {
        this.loadGroups();
        this.closeEditModal();
        alert('群组更新成功');
      },
      error: (error) => {
        console.error('更新群组失败:', error);
        alert('更新群组失败');
      }
    });
  }

  deleteGroup(group: Group) {
    if (confirm(`确定要删除群组 "${group.name}" 吗？此操作不可恢复。`)) {
      this.groupService.deleteGroup(group._id).subscribe({
        next: () => {
          this.loadGroups();
          alert('群组删除成功');
        },
        error: (error) => {
          console.error('删除群组失败:', error);
          if (error.error?.message?.includes('仍有用户使用此群组')) {
            alert('无法删除群组，仍有供应商使用此群组，请先移除相关用户。');
          } else {
            alert('删除群组失败');
          }
        }
      });
    }
  }

  openAssignModal(group: Group) {
    this.selectedGroup = group;
    this.selectedSuppliers = [];
    this.showAssignModal = true;
    this.cdr.detectChanges(); // 强制更新UI
  }

  closeAssignModal() {
    this.showAssignModal = false;
    this.selectedGroup = null;
    this.selectedSuppliers = [];
    this.cdr.detectChanges(); // 强制更新UI
  }

  assignUsersToGroup() {
    if (!this.selectedGroup || this.selectedSuppliers.length === 0) {
      alert('请选择要分配的供应商');
      return;
    }

    this.groupService.assignUsersToGroup(this.selectedGroup._id, this.selectedSuppliers).subscribe({
      next: () => {
        this.loadGroups();
        this.closeAssignModal();
        alert('用户分配成功');
      },
      error: (error) => {
        console.error('分配用户失败:', error);
        alert('分配用户失败');
      }
    });
  }

  onSupplierSelectionChange(event: any) {
    const value = event.target.value;
    const isChecked = event.target.checked;

    if (isChecked) {
      this.selectedSuppliers.push(value);
    } else {
      const index = this.selectedSuppliers.indexOf(value);
      if (index > -1) {
        this.selectedSuppliers.splice(index, 1);
      }
    }
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  // 权限检查方法
  isAdminOrQuoter(): boolean {
    return this.authService.hasRole(['admin', 'quoter']);
  }
}
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { SupplierGroupService, SupplierGroup, CreateSupplierGroupData, UpdateSupplierGroupData } from '../../services/supplier-group.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-supplier-group-management',
  templateUrl: './supplier-group-management.component.html',
  styleUrls: ['./supplier-group-management.component.scss']
})
export class SupplierGroupManagementComponent implements OnInit, OnDestroy {
  supplierGroups: SupplierGroup[] = [];
  loading = true;
  error = '';
  suppliers: any[] = [];
  
  // 模态框相关
  showCreateModal = false;
  showEditModal = false;
  showAssignModal = false;
  
  // 表单数据
  groupForm: CreateSupplierGroupData = {
    name: '',
    description: ''
  };
  
  editForm: UpdateSupplierGroupData = {};
  selectedGroup: SupplierGroup | null = null;
  selectedSuppliers: string[] = [];
  filteredSuppliers: any[] = [];

  private userSubscription: Subscription | null = null;

  constructor(
    private supplierGroupService: SupplierGroupService,
    private userService: UserService,
    public authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // 订阅用户状态变化
    this.userSubscription = this.authService.currentUser.subscribe(user => {
      if (user && ['admin', 'quoter'].includes(user.role)) {
        this.loadSupplierGroups();
        this.loadSuppliers();
      } else {
        this.error = '权限不足，只有管理员和报价员可以访问供应商群组管理';
        this.loading = false;
      }
    });
    
    // 初始检查用户权限
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || !['admin', 'quoter'].includes(currentUser.role)) {
      this.error = '权限不足，只有管理员和报价员可以访问供应商群组管理';
      this.loading = false;
    }
  }

  loadSupplierGroups() {
    this.loading = true;
    this.supplierGroupService.getAllSupplierGroups().subscribe({
      next: (supplierGroups) => {
        this.supplierGroups = supplierGroups;
        this.loading = false;
      },
      error: () => {
        this.error = '加载供应商群组失败';
        this.loading = false;
      }
    });
  }

  loadSuppliers() {
    this.userService.getSuppliers().subscribe({
      next: (suppliers) => {
        this.suppliers = suppliers;
        this.filteredSuppliers = suppliers;
      },
      error: (error) => {
        console.error('加载供应商失败:', error);
      }
    });
  }

  // 权限检查方法
  hasPermission(): boolean {
    return this.authService.hasRole(['admin', 'quoter']);
  }

  openCreateModal() {
    this.groupForm = {
      name: '',
      description: ''
    };
    this.showCreateModal = true;
    this.cdr.detectChanges(); // 强制更新UI
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  createSupplierGroup() {
    if (!this.groupForm.name.trim()) {
      alert('请输入供应商群组名称');
      return;
    }

    this.supplierGroupService.createSupplierGroup(this.groupForm).subscribe({
      next: () => {
        this.loadSupplierGroups();
        this.closeCreateModal();
        alert('供应商群组创建成功');
      },
      error: (error) => {
        console.error('创建供应商群组失败:', error);
        alert('创建供应商群组失败');
      }
    });
  }

  openEditModal(supplierGroup: SupplierGroup) {
    this.selectedGroup = supplierGroup;
    this.editForm = {
      name: supplierGroup.name,
      description: supplierGroup.description,
      isActive: supplierGroup.isActive
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

  updateSupplierGroup() {
    if (!this.selectedGroup || !this.editForm.name?.trim()) {
      alert('请输入供应商群组名称');
      return;
    }

    this.supplierGroupService.updateSupplierGroup(this.selectedGroup._id, this.editForm).subscribe({
      next: () => {
        this.loadSupplierGroups();
        this.closeEditModal();
        alert('供应商群组更新成功');
      },
      error: (error) => {
        console.error('更新供应商群组失败:', error);
        alert('更新供应商群组失败');
      }
    });
  }

  deleteSupplierGroup(supplierGroup: SupplierGroup) {
    if (confirm(`确定要删除供应商群组 "${supplierGroup.name}" 吗？此操作不可恢复。`)) {
      this.supplierGroupService.deleteSupplierGroup(supplierGroup._id).subscribe({
        next: () => {
          this.loadSupplierGroups();
          alert('供应商群组删除成功');
        },
        error: (error) => {
          console.error('删除供应商群组失败:', error);
          if (error.error?.message?.includes('仍有用户使用此群组')) {
            alert('无法删除供应商群组，仍有供应商使用此群组，请先移除相关用户。');
          } else {
            alert('删除供应商群组失败');
          }
        }
      });
    }
  }

  openAssignModal(supplierGroup: SupplierGroup) {
    this.selectedGroup = supplierGroup;
    // 预选已经在供应商群组中的供应商
    this.selectedSuppliers = supplierGroup.users ? supplierGroup.users.map(user => user._id) : [];
    this.filteredSuppliers = this.suppliers;
    this.showAssignModal = true;
    this.cdr.detectChanges(); // 强制更新UI
  }

  closeAssignModal() {
    this.showAssignModal = false;
    this.selectedGroup = null;
    this.selectedSuppliers = [];
    this.cdr.detectChanges(); // 强制更新UI
  }

  assignUsersToSupplierGroup() {
    if (!this.selectedGroup) {
      return;
    }

    this.supplierGroupService.assignUsersToSupplierGroup(this.selectedGroup._id, this.selectedSuppliers).subscribe({
      next: () => {
        this.loadSupplierGroups();
        this.closeAssignModal();
        const message = this.selectedSuppliers.length === 0 
          ? '已更新供应商群组成员' 
          : `已更新供应商群组成员，当前共 ${this.selectedSuppliers.length} 个供应商`;
        alert(message);
      },
      error: (error) => {
        console.error('更新供应商群组成员失败:', error);
        alert('更新供应商群组成员失败');
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

  toggleSupplierSelection(supplierId: string) {
    const index = this.selectedSuppliers.indexOf(supplierId);
    if (index > -1) {
      this.selectedSuppliers.splice(index, 1);
    } else {
      this.selectedSuppliers.push(supplierId);
    }
  }

  filterSuppliers(event: any) {
    const searchTerm = event.target.value.toLowerCase();
    
    if (!searchTerm) {
      this.filteredSuppliers = this.suppliers;
    } else {
      this.filteredSuppliers = this.suppliers.filter(supplier => 
        supplier.name.toLowerCase().includes(searchTerm) ||
        supplier.email.toLowerCase().includes(searchTerm) ||
        (supplier.company && supplier.company.toLowerCase().includes(searchTerm))
      );
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
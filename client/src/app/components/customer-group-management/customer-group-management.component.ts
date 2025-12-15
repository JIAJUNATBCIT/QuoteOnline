import { Component, OnInit } from '@angular/core';
import { CustomerGroupService, CustomerGroup, CreateCustomerGroupRequest } from '../../services/customer-group.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-customer-group-management',
  templateUrl: './customer-group-management.component.html',
  styleUrls: ['./customer-group-management.component.scss']
})
export class CustomerGroupManagementComponent implements OnInit {
  customerGroups: CustomerGroup[] = [];
  customers: any[] = [];
  selectedCustomers: string[] = [];
  loading = false;
  error: string | null = null;
  filteredCustomers: any[] = [];
  
  // 模态框控制
  showCreateModal = false;
  showAssignModal = false;
  
  // 表单数据
  editingGroup: CustomerGroup | null = null;
  groupForm: CreateCustomerGroupRequest = {
    name: '',
    description: ''
  };

  // 当前选中的群组用于分配客户
  selectedGroupForAssignment: CustomerGroup | null = null;

  constructor(
    private customerGroupService: CustomerGroupService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadCustomerGroups();
    this.loadCustomers();
  }

  ngAfterViewInit(): void {
    // 初始化过滤后的客户列表
    this.filteredCustomers = this.customers;
  }

  // 检查权限：管理员和报价员可以管理客户群组
  isAdminOrQuoter(): boolean {
    return this.authService.hasRole(['admin', 'quoter']);
  }

  // 加载客户群组
  loadCustomerGroups(): void {
    this.loading = true;
    this.customerGroupService.getCustomerGroups().subscribe({
      next: (groups) => {
        this.customerGroups = groups;
        this.loading = false;
      },
      error: (error) => {
        console.error('加载客户群组失败:', error);
        alert('加载客户群组失败');
        this.loading = false;
      }
    });
  }

  // 加载所有客户
  loadCustomers(): void {
    this.customerGroupService.getCustomers().subscribe({
      next: (customers) => {
        this.customers = customers.filter(customer => customer.isActive);
      },
      error: (error) => {
        console.error('加载客户失败:', error);
      }
    });
  }

  // 打开创建群组模态框
  openCreateGroupModal(): void {
    this.editingGroup = null;
    this.resetForm();
    this.showCreateModal = true;
  }

  // 打开编辑群组模态框
  openEditGroupModal(group: CustomerGroup): void {
    this.editingGroup = group;
    this.groupForm = {
      name: group.name,
      description: group.description || ''
    };
    this.showCreateModal = true;
  }

  // 打开分配客户模态框
  openAssignCustomersModal(group: CustomerGroup): void {
    this.selectedGroupForAssignment = group;
    // 默认选中已在群组中的客户
    this.selectedCustomers = group.customers?.map(c => c._id) || [];
    this.filteredCustomers = this.customers;
    this.showAssignModal = true;
  }

  // 关闭创建模态框
  closeCreateModal(): void {
    this.showCreateModal = false;
    this.editingGroup = null;
    this.resetForm();
  }

  // 关闭分配模态框
  closeAssignModal(): void {
    this.showAssignModal = false;
    this.selectedGroupForAssignment = null;
    this.selectedCustomers = [];
  }

  // 重置表单
  resetForm(): void {
    this.groupForm = {
      name: '',
      description: ''
    };
  }

  // 保存群组（创建或更新）
  saveGroup(): void {
    if (!this.groupForm.name.trim()) {
      alert('请输入群组名称');
      return;
    }

    if (this.editingGroup) {
      // 更新群组
      this.customerGroupService.updateCustomerGroup(this.editingGroup._id, this.groupForm).subscribe({
        next: (updatedGroup) => {
          const index = this.customerGroups.findIndex(g => g._id === updatedGroup._id);
          if (index !== -1) {
            this.customerGroups[index] = updatedGroup;
          }
          alert('客户群组更新成功');
          this.closeCreateModal();
        },
        error: (error) => {
          console.error('更新客户群组失败:', error);
          alert('更新客户群组失败');
        }
      });
    } else {
      // 创建群组
      this.customerGroupService.createCustomerGroup(this.groupForm).subscribe({
        next: (newGroup) => {
          this.customerGroups.unshift(newGroup);
          alert('客户群组创建成功');
          this.closeCreateModal();
        },
        error: (error) => {
          console.error('创建客户群组失败:', error);
          alert('创建客户群组失败');
        }
      });
    }
  }

  // 分配客户到群组
  assignCustomersToGroup(): void {
    if (!this.selectedGroupForAssignment) {
      alert('请选择要分配的群组');
      return;
    }

    this.customerGroupService.assignCustomersToGroup(
      this.selectedGroupForAssignment._id, 
      this.selectedCustomers
    ).subscribe({
        next: (updatedGroup) => {
          const index = this.customerGroups.findIndex(g => g._id === updatedGroup._id);
          if (index !== -1) {
            this.customerGroups[index] = updatedGroup;
          }
          const message = this.selectedCustomers.length === 0 
            ? '已更新客户群组成员' 
            : `成功分配 ${this.selectedCustomers.length} 个客户到群组`;
          alert(message);
          this.closeAssignModal();
        },
        error: (error) => {
          console.error('分配客户失败:', error);
          alert('分配客户失败');
        }
    });
  }

  // 从群组移除客户
  removeCustomerFromGroup(group: CustomerGroup, customerId: string): void {
    const customerName = group.customers?.find(c => c._id === customerId)?.name || '未知客户';
    
    if (!confirm(`确定要从群组 "${group.name}" 中移除客户 "${customerName}" 吗？`)) {
      return;
    }

    this.customerGroupService.removeCustomerFromGroup(group._id, customerId).subscribe({
        next: (updatedGroup) => {
          const index = this.customerGroups.findIndex(g => g._id === updatedGroup._id);
          if (index !== -1) {
            this.customerGroups[index] = updatedGroup;
          }
          alert(`客户 "${customerName}" 已从群组移除`);
        },
        error: (error) => {
          console.error('移除客户失败:', error);
          alert('移除客户失败');
        }
    });
  }

  // 删除群组
  deleteGroup(group: CustomerGroup): void {
    if (!confirm(`确定要删除客户群组 "${group.name}" 吗？此操作不可恢复。`)) {
      return;
    }

    this.customerGroupService.deleteCustomerGroup(group._id).subscribe({
        next: () => {
          this.customerGroups = this.customerGroups.filter(g => g._id !== group._id);
          alert('客户群组删除成功');
        },
        error: (error) => {
          console.error('删除客户群组失败:', error);
          alert('删除客户群组失败');
        }
    });
  }

  // 切换群组状态
  toggleGroupStatus(group: CustomerGroup): void {
    this.customerGroupService.updateCustomerGroup(group._id, { 
      isActive: !group.isActive 
    }).subscribe({
        next: (updatedGroup) => {
          const index = this.customerGroups.findIndex(g => g._id === updatedGroup._id);
          if (index !== -1) {
            this.customerGroups[index] = updatedGroup;
          }
          alert(`群组已${updatedGroup.isActive ? '启用' : '禁用'}`);
        },
        error: (error) => {
          console.error('切换群组状态失败:', error);
          alert('切换群组状态失败');
        }
    });
  }

  // 获取未分配到此群组的客户
  getAvailableCustomers(group: CustomerGroup): any[] {
    const assignedCustomerIds = group.customers?.map(c => c._id) || [];
    return this.customers.filter(customer => !assignedCustomerIds.includes(customer._id));
  }

  // 检查客户是否已在群组中
  isCustomerInGroup(customerId: string): boolean {
    return this.selectedGroupForAssignment?.customers?.some(c => c._id === customerId) || false;
  }

  // 客户选择状态变化
  onCustomerSelectionChange(event: any): void {
    const value = event.target.value;
    const isChecked = event.target.checked;

    if (isChecked) {
      this.selectedCustomers.push(value);
    } else {
      const index = this.selectedCustomers.indexOf(value);
      if (index > -1) {
        this.selectedCustomers.splice(index, 1);
      }
    }
  }

  // 切换客户选择状态
  toggleCustomerSelection(customerId: string): void {
    const index = this.selectedCustomers.indexOf(customerId);
    if (index > -1) {
      this.selectedCustomers.splice(index, 1);
    } else {
      this.selectedCustomers.push(customerId);
    }
  }

  // 全选/取消全选所有客户
  toggleSelectAllCustomers(): void {
    if (this.selectedCustomers.length === this.customers.length) {
      this.selectedCustomers = [];
    } else {
      this.selectedCustomers = this.customers.map(c => c._id);
    }
  }

  // 过滤客户
  filterCustomers(event: any): void {
    const searchTerm = event.target.value.toLowerCase();
    
    if (!searchTerm) {
      this.filteredCustomers = this.customers;
    } else {
      this.filteredCustomers = this.customers.filter(customer => 
        customer.name.toLowerCase().includes(searchTerm) ||
        customer.email.toLowerCase().includes(searchTerm) ||
        (customer.company && customer.company.toLowerCase().includes(searchTerm))
      );
    }
  }

  // 获取群组创建者显示名称
  getCreatorName(group: CustomerGroup): string {
    return group.createdBy?.name || '未知用户';
  }

  // 获取状态显示文本
  getStatusText(isActive: boolean): string {
    return isActive ? '启用' : '禁用';
  }

  // 获取状态样式类
  getStatusClass(isActive: boolean): string {
    return isActive ? 'text-success' : 'text-danger';
  }
}
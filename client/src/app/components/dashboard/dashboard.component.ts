import { Component, OnInit } from '@angular/core';
import { QuoteService, Quote } from '../../services/quote.service';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  quotes: Quote[] = [];
  filteredQuotes: Quote[] = [];
  loading = false;
  error = '';
  searchTerm = '';
  sortColumn = 'createdAt';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  // 筛选相关
  selectedStatus = '';
  dateRange = {
    start: '',
    end: ''
  };
  
  // 状态选项
  statusOptions = [
    { value: '', label: '全部状态' },
    { value: 'unquoted', label: '未报价' },
    { value: 'pending', label: '待处理' },
    { value: 'in_progress', label: '处理中' },
    { value: 'supplier_quoted', label: '核价中' },
    { value: 'quoted', label: '已报价' },
    { value: 'rejected', label: '不报价' }
  ];
  
  // 分页相关
  currentPage = 1;
  itemsPerPage = 10;
  itemsPerPageOptions = [5, 10, 20, 50];
  
  constructor(
    public authService: AuthService,
    private quoteService: QuoteService,
    private permissionService: PermissionService,
    
  ) { }

  async ngOnInit() {
    // 先加载配置
    try {

    } catch (error) {
      console.error('Dashboard - 配置加载失败:', error);
    }
    
    this.loadQuotes();
  }

  loadQuotes() {
    this.loading = true;
    this.quoteService.getAllQuotes().subscribe({
      next: (quotes) => {
        // 后端已经根据用户角色过滤了数据，直接使用返回的结果
        this.quotes = quotes;
        this.applyFiltersAndSort();
        this.loading = false;
      },
      error: (error) => {
        this.error = '加载询价单失败';
        this.loading = false;
        console.error(error);
      }
    });
  }

  applyFiltersAndSort() {
    // 应用搜索过滤
    let filtered = this.quotes;
    
    // 应用状态筛选
    if (this.selectedStatus) {
      if (this.selectedStatus === 'unquoted') {
        // "未报价"选项：筛选出除"已报价"和"不报价"外的所有记录
        filtered = filtered.filter(quote => quote.status !== 'quoted' && quote.status !== 'rejected');
      } else {
        filtered = filtered.filter(quote => quote.status === this.selectedStatus);
      }
    }
    
    // 应用日期范围筛选
    if (this.dateRange.start) {
      const startDate = new Date(this.dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(quote => new Date(quote.createdAt) >= startDate);
    }
    
    if (this.dateRange.end) {
      const endDate = new Date(this.dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(quote => new Date(quote.createdAt) <= endDate);
    }
    
    // 应用搜索过滤
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(quote => 
        quote.quoteNumber.toLowerCase().includes(searchLower) ||
        quote.title.toLowerCase().includes(searchLower) ||
        (quote.description && quote.description.toLowerCase().includes(searchLower)) ||
        (quote.customer?.name && quote.customer.name.toLowerCase().includes(searchLower)) ||
        (quote.quoter?.name && quote.quoter.name.toLowerCase().includes(searchLower)) ||
        (quote.supplier?.name && quote.supplier.name.toLowerCase().includes(searchLower)) ||
        this.getStatusDisplayName(quote.status).toLowerCase().includes(searchLower)
      );
    }
    
    // 应用排序
    filtered = this.sortQuotes(filtered, this.sortColumn, this.sortDirection);
    
    this.filteredQuotes = filtered;
    
    // 重置到第一页
    this.currentPage = 1;
    
    // 应用分页
    this.updatePagination();
  }

  sortQuotes(quotes: Quote[], column: string, direction: 'asc' | 'desc'): Quote[] {
    return [...quotes].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (column) {
        case 'quoteNumber':
          aValue = a.quoteNumber;
          bValue = b.quoteNumber;
          break;
        case 'title':
          aValue = a.title;
          bValue = b.title;
          break;
        case 'customer':
          aValue = a.customer?.name || '';
          bValue = b.customer?.name || '';
          break;
        case 'quoter':
          aValue = a.quoter?.name || '';
          bValue = b.quoter?.name || '';
          break;
        case 'supplier':
          aValue = a.supplier?.name || '';
          bValue = b.supplier?.name || '';
          break;
        case 'status':
          aValue = this.getStatusDisplayName(a.status);
          bValue = this.getStatusDisplayName(b.status);
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) {
        return direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  onSort(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFiltersAndSort();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'bi bi-arrow-down-up';
    }
    return this.sortDirection === 'asc' ? 'bi bi-arrow-up' : 'bi bi-arrow-down';
  }

  onSearchChange() {
    this.applyFiltersAndSort();
  }

  // 筛选相关方法
  onStatusChange() {
    this.applyFiltersAndSort();
  }

  onDateRangeChange() {
    this.applyFiltersAndSort();
  }

  // 清除筛选条件
  clearFilters() {
    this.selectedStatus = '';
    this.dateRange = { start: '', end: '' };
    this.searchTerm = '';
    this.applyFiltersAndSort();
  }

  // 检查是否有激活的筛选条件
  hasActiveFilters(): boolean {
    return !!(this.selectedStatus || this.dateRange.start || this.dateRange.end || this.searchTerm.trim());
  }

  // 分页相关方法
  get totalItems(): number {
    return this.filteredQuotes.length;
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  get paginatedQuotes(): Quote[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredQuotes.slice(startIndex, endIndex);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    if (this.totalPages <= maxVisiblePages) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      const half = Math.floor(maxVisiblePages / 2);
      let start = Math.max(1, this.currentPage - half);
      let end = Math.min(this.totalPages, start + maxVisiblePages - 1);
      
      if (end - start < maxVisiblePages - 1) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  onPageChange(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  onItemsPerPageChange() {
    this.currentPage = 1;
    this.updatePagination();
  }

  updatePagination() {
    // 这个方法会在模板中触发分页更新
  }

  // 状态显示名称
  getStatusDisplayName(status: string): string {
    switch (status) {
      case 'pending':
        return '待处理';
      case 'in_progress':
        return '处理中';
      case 'supplier_quoted':
        return '核价中';
      case 'quoted':
        return '已报价';
      case 'rejected':
        return '不报价';
      default:
        return status;
    }
  }

  // 根据状态统计询价单数量
  getQuoteCountByStatus(status: string): number {
    return this.quotes.filter(quote => quote.status === status).length;
  }

  // 导航到询价单详情
  navigateToQuoteDetail(quoteId: string) {
    // 使用相对路径导航
    window.location.href = `/quotes/${quoteId}`;
  }

  // 批量下载文件
  downloadFilesBatch(quoteId: string, fileType: string) {
    this.quoteService.downloadFilesBatch(quoteId, fileType).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 根据文件类型设置文件名
        let fileName = '';
        switch (fileType) {
          case 'customer':
            fileName = '询价文件.zip';
            break;
          case 'supplier':
            fileName = '供应商报价.zip';
            break;
          case 'quoter':
            fileName = '最终报价.zip';
            break;
          default:
            fileName = '文件.zip';
        }
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('下载文件失败:', error);
        alert('下载文件失败，请重试');
      }
    });
  }

  // 检查是否可以删除询价单
  canDeleteQuote(quote: Quote): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    return this.permissionService.canDeleteQuote(quote, user);
  }

  // 删除询价单
  deleteQuote(quote: Quote) {
    if (!confirm(`确定要删除询价单 "${quote.quoteNumber}" 吗？此操作不可撤销。`)) {
      return;
    }

    this.quoteService.deleteQuote(quote._id).subscribe({
      next: () => {
        // 从列表中移除删除的询价单
        this.quotes = this.quotes.filter(q => q._id !== quote._id);
        this.applyFiltersAndSort();
      },
      error: (error) => {
        console.error('删除询价单失败:', error);
        alert('删除询价单失败，请重试');
      }
    });
  }
}
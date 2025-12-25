import { Component, OnInit, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QuoteService, Quote } from '../../services/quote.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { PermissionService } from '../../services/permission.service';
import { TokenService } from '../../services/token.service';
import { getStatusDisplayName } from '../../utils/status.utils';
import { FileUtils, TempFile } from '../../utils/file.utils';
import { environment } from '../../../../environment';

import { SupplierGroupService, SupplierGroup } from '../../services/supplier-group.service';

@Component({
  selector: 'app-quote-detail',
  templateUrl: './quote-detail.component.html',
  styleUrls: ['./quote-detail.component.scss']
})
export class QuoteDetailComponent implements OnInit {
  
  // 添加页面离开提醒
  canDeactivate(): boolean {
    if (this.hasUnsavedChanges) {
      return confirm('您有未上传的文件，确定要离开吗？未保存的文件将会丢失。');
    }
    return true;
  }
  quote: Quote | null = null;
  loading = true;
  error = '';
  quoters: any[] = [];
  suppliers: any[] = [];
  supplierGroups: SupplierGroup[] = [];
  uploading = false;
  uploadProgress = 0;
  assigning = false;
  selectedSupplierId = '';
  selectedGroupId = '';
  selectedFiles: File[] = [];
  selectedGroupIds: string[] = [];
  showGroupAssignModal = false;
  hasUnsavedChanges = false; // 标记是否有未保存的文件更改
  tempCustomerFiles: File[] = []; // 临时存储客户文件
  tempSupplierFiles: File[] = []; // 临时存储供应商文件
  tempQuoterFiles: File[] = []; // 临时存储报价员文件
  
  // 临时文件映射，用于FileUtils
  private tempFilesMap: { [key: string]: TempFile[] } = {
    customer: [],
    supplier: [],
    quoter: []
  };
  
  // 文件预览相关属性
  currentPreviewFile: any = null;
  currentPreviewType: string = '';
  currentPreviewIndex: number = 0;
  previewUrl: string = '';
  previewLoading: boolean = false;
  previewError: string = '';
  private previewModal: any = null;

  constructor(
    private route: ActivatedRoute,
    private quoteService: QuoteService,
    public authService: AuthService,
    private userService: UserService,
    private permissionService: PermissionService,
    private tokenService: TokenService,
    private ngZone: NgZone,
    private supplierGroupService: SupplierGroupService,
    
  ) { }

  ngOnInit() {
    const quoteId = this.route.snapshot.paramMap.get('id');
    if (quoteId) {
      this.loadQuote(quoteId);
      if (this.authService.hasRole('admin')) {
        this.loadQuoters();
      }
      if (this.authService.hasRole('quoter') || this.authService.hasRole('admin')) {
        console.log('User has quoter/admin role, loading suppliers and groups...');
        this.loadSuppliers();
        this.loadSupplierGroups();
      } else {
        console.log('User does not have quoter/admin role. Role:', this.authService.getCurrentUser()?.role);
      }
    }
  }

  loadQuote(id: string) {
    this.loading = true;
    this.quoteService.getQuoteById(id).subscribe({
      next: (quote) => {
        this.quote = quote;
        this.loading = false;

      },
      error: (error) => {
        console.error('加载询价单详细错误:', error);
        this.error = '加载询价单失败';
        this.loading = false;
      }
    });
  }

  loadQuoters() {
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.quoters = users.filter(user => user.role === 'quoter' && user.isActive);
      },
      error: (error) => {
        console.error('加载报价员失败:', error);
      }
    });
  }

  loadSuppliers() {
    this.userService.getSuppliers().subscribe({
      next: (suppliers) => {
        this.suppliers = suppliers;
      },
      error: (error) => {
        console.error('加载供应商列表失败:', error);
      }
    });
  }

  loadSupplierGroups() {
    this.supplierGroupService.getAllSupplierGroups().subscribe({
      next: (supplierGroups) => {
        this.supplierGroups = supplierGroups.filter(supplierGroup => supplierGroup.isActive);
      },
      error: (error) => {
        console.error('加载群组列表失败:', error);
      }
    });
  }

  // 获取指定类型的文件列表（包括临时文件）
  getFiles(fileType: string): TempFile[] {
    if (!this.quote) return [];
    
    // 更新临时文件映射
    this.updateTempFilesMap();
    
    return FileUtils.getFilesByType(this.quote, fileType, this.tempFilesMap);
  }

  // 获取指定类型的临时文件
  getTempFilesByType(fileType: string): TempFile[] {
    this.updateTempFilesMap();
    return FileUtils.getTempFilesByType(this.tempFilesMap, fileType);
  }

  // 检查是否有指定类型的文件
  hasFiles(fileType: string): boolean {
    if (!this.quote) return false;
    
    this.updateTempFilesMap();
    return FileUtils.hasFilesByType(this.quote, fileType, this.tempFilesMap);
  }

  // 更新临时文件映射
  private updateTempFilesMap(): void {
    this.tempFilesMap = {
      customer: this.tempCustomerFiles.map((file, index) => FileUtils.createTempFile(file, index)),
      supplier: this.tempSupplierFiles.map((file, index) => FileUtils.createTempFile(file, index)),
      quoter: this.tempQuoterFiles.map((file, index) => FileUtils.createTempFile(file, index))
    };
  }

  downloadFile(fileType: string, fileIndex?: number) {
    if (!this.quote || this.uploading) return;
    
    // 根据用户角色和询价单状态决定下载哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时下载原文件，已报价时下载报价文件
      actualFileType = this.quote.status === 'quoted' ? 'quoter' : 'customer';
    }
    
    this.quoteService.downloadFile(this.quote._id, actualFileType, fileIndex).subscribe({
      next: (blob) => {
        this.ngZone.run(() => {
          try {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.style.display = 'none';
            document.body.appendChild(a);
            
            // 获取文件名
            const files = this.getFiles(actualFileType);
            const targetFile = fileIndex !== undefined && files[fileIndex] 
              ? files[fileIndex] 
              : files[0];
            const originalName = targetFile?.originalName || `${this.quote?.quoteNumber}_${actualFileType}.xlsx`;
            
            a.download = originalName;
            
            // 使用setTimeout确保DOM操作完成
            setTimeout(() => {
              a.click();
              // 延迟清理URL和DOM元素
              setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }, 100);
            }, 0);
          } catch (error) {
            console.error('下载文件处理失败:', error);
            alert('下载文件处理失败');
          }
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('下载文件失败:', error);
          alert('下载文件失败');
        });
      }
    });
  }

  // 单个文件下载（新增方法）
  downloadSingleFile(fileType: string, fileIndex?: number) {
    if (!this.quote || this.uploading) return;
    
    // 根据用户角色和询价单状态决定下载哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时下载原文件，已报价时下载报价文件
      actualFileType = this.quote.status === 'quoted' ? 'quoter' : 'customer';
    }
    
    this.quoteService.downloadFile(this.quote._id, actualFileType, fileIndex).subscribe({
      next: (blob) => {
        this.ngZone.run(() => {
          try {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.style.display = 'none';
            document.body.appendChild(a);
            
            // 获取文件名
            const files = this.getFiles(actualFileType);
            const targetFile = fileIndex !== undefined && files[fileIndex] 
              ? files[fileIndex] 
              : files[0];
            const originalName = targetFile?.originalName || `${this.quote?.quoteNumber}_${actualFileType}.xlsx`;
            
            a.download = originalName;
            
            // 使用setTimeout确保DOM操作完成
            setTimeout(() => {
              a.click();
              // 延迟清理URL和DOM元素
              setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }, 100);
            }, 0);
          } catch (error) {
            console.error('下载文件处理失败:', error);
            alert('下载文件处理失败');
          }
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('下载文件失败:', error);
          alert('下载文件失败');
        });
      }
    });
  }

  // 文件预览
  previewFile(fileType: string, fileIndex?: number) {
    if (!this.quote || this.uploading) return;
    
    // 根据用户角色和询价单状态决定预览哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时预览原文件，已报价时预览报价文件
      actualFileType = this.quote.status === 'quoted' ? 'quoter' : 'customer';
    }
    
    // 获取文件信息
    const files = this.getFiles(actualFileType);
    const targetFile = fileIndex !== undefined && files[fileIndex] 
      ? files[fileIndex] 
      : files[0];
    
    if (!targetFile) {
      alert('文件不存在');
      return;
    }
    
    // 如果是Office文件，直接下载而不是预览
    if (this.isOfficeFile(targetFile.originalName)) {
      this.downloadSingleFile(actualFileType, fileIndex);
      return;
    }
    
    this.currentPreviewFile = targetFile;
    this.currentPreviewType = actualFileType;
    this.currentPreviewIndex = fileIndex || 0;
    this.previewLoading = true;
    this.previewError = '';
    
    // 下载文件用于预览（仅支持图片和PDF）
    console.log('开始预览文件:', targetFile.originalName, '类型:', actualFileType, '索引:', fileIndex);
    this.quoteService.downloadFile(this.quote._id, actualFileType, fileIndex).subscribe({
      next: (blob) => {
        this.ngZone.run(() => {
          this.previewUrl = window.URL.createObjectURL(blob);
          console.log('文件预览URL已创建:', this.previewUrl, '文件大小:', blob.size, '类型:', blob.type);
          
          // 对于图片和PDF，检查实际的blob类型是否匹配文件扩展名
          if (this.isImageFile(targetFile.originalName) && !blob.type.startsWith('image/')) {
            console.warn('图片文件类型不匹配，文件名:', targetFile.originalName, '实际类型:', blob.type);
          } else if (this.isPdfFile(targetFile.originalName) && blob.type !== 'application/pdf') {
            console.warn('PDF文件类型不匹配，文件名:', targetFile.originalName, '实际类型:', blob.type);
          }
          
          this.previewLoading = false;
          
          // 显示预览模态框
          this.showPreviewModal();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          this.previewLoading = false;
          this.previewError = '无法加载文件预览，请检查文件是否完整或尝试下载文件查看';
          console.error('预览文件失败:', error);
          
          // 显示预览模态框（显示错误信息）
          this.showPreviewModal();
        });
      }
    });
  }

  // 显示预览模态框
  private showPreviewModal() {
    // 等待下一个变化检测周期，确保 DOM 已更新
    setTimeout(() => {
      const modalElement = document.getElementById('filePreviewModal');
      if (modalElement) {
        if (!this.previewModal) {
          this.previewModal = new (window as any).bootstrap.Modal(modalElement);
        }
        this.previewModal.show();
      } else {
        console.error('模态框元素未找到');
      }
    }, 0);
  }

  // 隐藏预览模态框
  private hidePreviewModal() {
    if (this.previewModal) {
      this.previewModal.hide();
    }
  }

  // 检查是否为图片文件
  isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return imageExtensions.includes(extension);
  }

  // 检查是否为PDF文件
  isPdfFile(filename: string): boolean {
    return filename.toLowerCase().endsWith('.pdf');
  }

  // 检查是否为Office文件
  isOfficeFile(filename: string): boolean {
    const officeExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return officeExtensions.includes(extension);
  }

  // 检查文件是否可以预览
  isPreviewable(filename: string): boolean {
    return this.isImageFile(filename) || this.isPdfFile(filename);
  }

  // 批量下载文件
  downloadFilesBatch(fileType: string) {
    if (!this.quote || this.uploading) return;
    
    // 根据用户角色和询价单状态决定下载哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时下载原文件，已报价时下载报价文件
      actualFileType = this.quote.status === 'quoted' ? 'quoter' : 'customer';
    }
    
    this.quoteService.downloadFilesBatch(this.quote._id, actualFileType).subscribe({
      next: (blob) => {
        this.ngZone.run(() => {
          try {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.style.display = 'none';
            document.body.appendChild(a);
            
            // 生成ZIP文件名（使用英文避免字符编码问题）
            const zipFileName = `${this.quote?.quoteNumber}_${actualFileType}_files.zip`;
            a.download = zipFileName;
            
            // 使用setTimeout确保DOM操作完成
            setTimeout(() => {
              a.click();
              // 延迟清理URL和DOM元素
              setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }, 100);
            }, 0);
          } catch (error) {
            console.error('批量下载文件处理失败:', error);
            alert('批量下载文件处理失败');
          }
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('批量下载文件失败:', error);
          alert('批量下载文件失败');
        });
      }
    });
  }



  onFilesSelected(event: any) {
    const files = Array.from(event.target.files) as File[];
    if (files.length === 0) return;
    
    // 检查用户权限和状态
    const user = this.authService.getCurrentUser();
    if (user?.role === 'customer' && this.quote?.status !== 'pending') {
      alert('询价单不是待处理状态，无法选择文件');
      event.target.value = '';
      return;
    }
    
    if (user?.role === 'supplier' && !['in_progress', 'rejected', 'supplier_quoted'].includes(this.quote?.status || '')) {
      alert('询价单当前状态不允许选择文件');
      event.target.value = '';
      return;
    }
    
    // 询价员和管理员在询价的任何阶段都可以上传最终报价文件
    // if ((user?.role === 'quoter' || user?.role === 'admin') && !['pending', 'supplier_quoted', 'in_progress','quoted'].includes(this.quote?.status || '')) {
    //   alert('询价单当前状态不允许上传最终报价文件');
    //   event.target.value = '';
    //   return;
    // }
    
    // 检查所有文件类型和大小
    const validFiles: File[] = [];
    for (const file of files) {
      // 检查文件类型
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert(`文件 "${file.name}" 不是Excel文件，请选择 .xlsx 或 .xls 文件`);
        continue;
      }
      
      // 检查文件大小 (10MB限制)
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件 "${file.name}" 大小超过10MB限制`);
        continue;
      }
      
      validFiles.push(file);
    }
    
    // 根据用户角色将文件分类存储
    if (validFiles.length > 0) {
      this.ngZone.run(() => {
        this.hasUnsavedChanges = true;
        
        switch (user?.role) {
          case 'customer':
            this.tempCustomerFiles = [...this.tempCustomerFiles, ...validFiles];
            break;
          case 'supplier':
            this.tempSupplierFiles = [...this.tempSupplierFiles, ...validFiles];
            break;
          case 'quoter':
          case 'admin':
            this.tempQuoterFiles = [...this.tempQuoterFiles, ...validFiles];
            break;
        }
      });
    }
    
    // 清空文件输入框，允许重复选择相同文件
    event.target.value = '';
  }



  // 验证token是否有效
  private validateTokenBeforeUpload(): boolean {
    const token = this.tokenService.getAccessToken();
    
    if (!token) {
      this.ngZone.run(() => {
        alert('请先登录');
        this.authService.logout();
      });
      return false;
    }
    
    // 检查token是否过期
    if (this.tokenService.isTokenExpired()) {
      this.ngZone.run(() => {
        alert('登录已过期，正在重新登录...');
        // 尝试刷新token
        this.tokenService.refreshToken().subscribe({
          next: () => {
            // token刷新成功，可以继续上传
          },
          error: () => {
            alert('登录已过期，请重新登录');
            this.authService.logout();
          }
        });
      });
      return false;
    }
    
    return true;
  }

  // 多文件上传方法
  private uploadFiles(files: File[], fileType: string, successMessage: string, errorMessage: string, callback?: () => void) {
    if (!this.quote) return;
    
    // 在上传前验证token
    if (!this.validateTokenBeforeUpload()) {
      return;
    }
    
    this.uploading = true;
    this.uploadProgress = 0;
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    // 添加文件类型信息，告知后端这些文件应该存储在哪个数组中
    formData.append('fileType', fileType);
    
    // 创建带进度的HTTP请求
    const xhr = new XMLHttpRequest();
    
    // 监听上传进度
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        this.uploadProgress = Math.round((event.loaded / event.total) * 100);
      }
    });
    
    // 监听响应
    xhr.addEventListener('load', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        
        if (xhr.status === 200) {
          try {
            const updatedQuote = JSON.parse(xhr.responseText);
            console.log('上传成功，更新后的询价单:', updatedQuote);
            console.log('供应商文件列表:', updatedQuote.supplierFiles);

            this.quote = updatedQuote;
            console.log('设置this.quote后的quoterFiles:', this.quote?.quoterFiles);
            
            // 清空对应的临时文件列表
            const user = this.authService.getCurrentUser();
            switch (user?.role) {
              case 'customer':
                this.tempCustomerFiles = [];
                break;
              case 'supplier':
                this.tempSupplierFiles = [];
                break;
              case 'quoter':
              case 'admin':
                this.tempQuoterFiles = [];
                break;
            }
            
            this.hasUnsavedChanges = this.tempCustomerFiles.length > 0 || 
                                     this.tempSupplierFiles.length > 0 || 
                                     this.tempQuoterFiles.length > 0;
            
            alert(successMessage);
            
            // 执行回调函数（如果有）
            if (callback) {
              callback();
            }
          } catch (error) {
            console.error('解析响应失败:', error);
            alert('上传响应解析失败');
          }
        } else if (xhr.status === 401) {
          // 处理401未授权错误
          console.error('上传失败: 401', xhr.responseText);
          alert('登录已过期，请重新登录');
          this.authService.logout();
        } else {
          console.error('上传失败:', xhr.status, xhr.responseText);
          alert(errorMessage);
        }
      });
    });
    
    // 监听错误和超时
    xhr.addEventListener('error', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        console.error('网络错误');
        
        // 检查是否是token问题
        if (!this.tokenService.getAccessToken()) {
          alert('登录已过期，请重新登录');
          this.authService.logout();
        } else {
          alert('网络错误，上传失败');
        }
      });
    });
    
    xhr.addEventListener('timeout', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        console.error('上传超时');
        alert('上传超时，请重试');
      });
    });
    
    // 配置请求
    xhr.timeout = 120000; // 2分钟超时（多文件需要更长时间）
    const url = `${environment.apiUrl}/quotes/${this.quote._id}`;
    xhr.open('PUT', url);
    
    // 添加认证头 - 使用TokenService获取正确的token
    const token = this.tokenService.getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    } else {
      // 如果没有token，取消上传并提示用户重新登录
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        alert('登录已过期，请重新登录');
        this.authService.logout();
      });
      return;
    }
    
    // 发送请求
    xhr.send(formData);
  }

  uploadCustomerFiles(files: File[], callback?: () => void) {
    this.uploadFiles(files, 'customer', `成功上传 ${files.length} 个询价文件`, '上传询价文件失败', callback);
  }

  uploadSupplierFiles(files: File[], callback?: () => void) {
    this.uploadFiles(files, 'supplier', `成功上传 ${files.length} 个报价文件`, '上传报价文件失败', callback);
  }

  uploadQuoterFiles(files: File[], callback?: () => void) {
    this.uploadFiles(files, 'quoter', `成功上传 ${files.length} 个最终报价文件`, '上传最终报价文件失败', callback);
  }



  // 确认更新指定类型的文件
  confirmUpdateFiles(fileType: string) {
    const tempFiles = this.getTempFilesByType(fileType);
    if (tempFiles.length === 0) {
      alert('没有需要上传的文件');
      return;
    }
    
    // 检查权限和状态
    const user = this.authService.getCurrentUser();
    if (user?.role === 'customer' && fileType === 'customer') {
      if (this.quote?.status !== 'pending') {
        alert('询价单不是待处理状态，无法上传文件');
        return;
      }
      this.uploadCustomerFiles(tempFiles.map(tf => tf.file!).filter(f => f !== undefined));
    } else if (user?.role === 'supplier' && fileType === 'supplier') {
      if (!['in_progress', 'rejected', 'supplier_quoted'].includes(this.quote?.status || '')) {
        alert('询价单当前状态不允许上传文件');
        return;
      }
      this.uploadSupplierFiles(tempFiles.map(tf => tf.file!).filter(f => f !== undefined));
    } else if ((user?.role === 'quoter' || user?.role === 'admin') && fileType === 'quoter') {
      if (!['pending', 'supplier_quoted', 'in_progress', 'quoted'].includes(this.quote?.status || '')) {
        alert('询价单当前状态不允许上传最终报价文件');
        return;
      }
      this.uploadQuoterFiles(tempFiles.map(tf => tf.file!).filter(f => f !== undefined));
    }
  }

  // 清除选择的文件
  clearSelectedFiles() {
    this.ngZone.run(() => {
      const user = this.authService.getCurrentUser();
      
      switch (user?.role) {
        case 'customer':
          this.tempCustomerFiles = [];
          break;
        case 'supplier':
          this.tempSupplierFiles = [];
          break;
        case 'quoter':
        case 'admin':
          this.tempQuoterFiles = [];
          break;
      }
      
      this.hasUnsavedChanges = this.tempCustomerFiles.length > 0 || 
                               this.tempSupplierFiles.length > 0 || 
                               this.tempQuoterFiles.length > 0;
    });
  }

  // 获取当前用户的临时文件列表
  getTempFiles(): File[] {
    const user = this.authService.getCurrentUser();
    
    switch (user?.role) {
      case 'customer':
        return this.tempCustomerFiles;
      case 'supplier':
        return this.tempSupplierFiles;
      case 'quoter':
      case 'admin':
        return this.tempQuoterFiles;
      default:
        return [];
    }
  }

  // 移除单个文件（包括临时文件）
  removeFile(fileType: string, index: number) {
    this.ngZone.run(() => {
      const files = this.getFiles(fileType);
      const targetFile = files[index];
      if (targetFile.isTemp && targetFile.tempIndex !== undefined) {
        // 移除临时文件，使用保存的tempIndex
        switch (fileType) {
          case 'customer':
            if (targetFile.tempIndex >= 0 && targetFile.tempIndex < this.tempCustomerFiles.length) {
              this.tempCustomerFiles.splice(targetFile.tempIndex, 1);
            }
            break;
          case 'supplier':
            if (targetFile.tempIndex >= 0 && targetFile.tempIndex < this.tempSupplierFiles.length) {
              this.tempSupplierFiles.splice(targetFile.tempIndex, 1);
            }
            break;
          case 'quoter':
            if (targetFile.tempIndex >= 0 && targetFile.tempIndex < this.tempQuoterFiles.length) {
              this.tempQuoterFiles.splice(targetFile.tempIndex, 1);
            }
            break;
        }
        
        this.hasUnsavedChanges = this.tempCustomerFiles.length > 0 || 
                                 this.tempSupplierFiles.length > 0 || 
                                 this.tempQuoterFiles.length > 0;
      } else {
        // 计算在已保存文件列表中的实际索引
        let savedFileIndex = 0;
        for (let i = 0; i < index; i++) {
          if (!files[i].isTemp) {
            savedFileIndex++;
          }
        }
        // 调用原有的删除文件方法
        this.deleteFile(fileType, savedFileIndex);
      }
    });
  }

  // 格式化文件大小
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  deleteFile(fileType: string, fileIndex?: number) {
    if (!this.quote) return;
    
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    // 检查权限
    if (!this.permissionService.canDeleteFile(this.quote, fileType, user)) {
      alert('您没有权限删除此文件');
      return;
    }

    // 确认删除
    const files = this.getFiles(fileType);
    const targetFile = fileIndex !== undefined && files[fileIndex] 
      ? files[fileIndex] 
      : files[0];
    
    if (!targetFile) {
      alert('文件不存在');
      return;
    }
    
    const confirmMessage = `确定要删除文件 "${targetFile.originalName}" 吗？`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    // 构建删除请求数据
    const formData = new FormData();
    formData.append('deleteFileIndex', fileIndex?.toString() || '0');
    formData.append('deleteFileType', fileType);
    
    this.quoteService.updateQuote(this.quote._id, formData).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert(`文件 "${targetFile.originalName}" 删除成功`);
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('删除文件失败:', error);
          const errorMessage = error.error?.message || error.message || '删除文件失败';
          alert(errorMessage);
        });
      }
    });
  }



  assignToQuoter(quoterId: string) {
    if (!this.quote) return;
    
    this.quoteService.assignQuote(this.quote._id, quoterId).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('分配成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('分配失败:', error);
          alert('分配失败');
        });
      }
    });
  }

  assignSingleGroup() {
    // 权限检查：只有报价员或管理员可以分配
    if (!this.authService.hasRole('quoter') && !this.authService.hasRole('admin')) {
      alert('权限不足，只有报价员和管理员可以分配供应商群组');
      return;
    }
    
    if (!this.quote || !this.selectedGroupId) {
      return;
    }
    this.assigning = true;
    this.quoteService.assignGroupsToQuote(this.quote._id, [this.selectedGroupId]).subscribe({
      next: (quote) => {
        console.log('API success:', quote);
        this.ngZone.run(() => {
          this.quote = quote;
          this.assigning = false;
          this.selectedGroupId = '';
          alert('供应商分配成功');
        });
      },
      error: (error) => {
        console.error('API error:', error);
        this.ngZone.run(() => {
          console.error('分配供应商失败:', error);
          this.assigning = false;
          alert('分配供应商失败: ' + (error.message || error.error?.message || '未知错误'));
        });
      }
    });
  }





  updateUrgentStatus() {
    if (!this.quote) return;
    
    const formData = new FormData();
    formData.append('urgent', this.quote.urgent.toString());
    
    this.quoteService.updateQuote(this.quote._id, formData).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          console.log('加急状态更新成功:', quote.urgent);
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('更新加急状态失败:', error);
          // 恢复原始状态
          if (this.quote) {
            this.quote.urgent = !this.quote.urgent;
          }
          alert('更新加急状态失败');
        });
      }
    });
  }



  canReject(): boolean {
    if (!this.quote) return false;
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    // 如果已经报价，则不能在拒绝报价，如果拒绝报价了，就不能再拒绝
    if (['quoted', 'rejected'].includes(this.quote.status)) return false;
    
    return this.permissionService.canRejectQuote(user);
  }

  canDeleteFile(fileType: string): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    if (!this.quote) return false;
    return this.permissionService.canDeleteFile(this.quote, fileType, user);
  }

  rejectQuote() {
    if (!this.quote) return;
    
    const reason = prompt('请输入不予报价的理由:');
    if (!reason) return;
    
    this.quoteService.rejectQuote(this.quote._id, reason).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('不予报价理由已记录');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('记录不予报价理由失败:', error);
          alert('记录不予报价理由失败');
        });
      }
    });
  }

  confirmSupplierQuote() {
    if (!this.quote) return;
    
    // 如果有待上传的供应商文件，先上传再确认
    if (this.tempSupplierFiles.length > 0) {
      this.uploadSupplierFiles(this.tempSupplierFiles, () => {
        // 上传成功后执行确认报价
        this.doConfirmSupplierQuote();
      });
    } else {
      // 没有待上传文件，直接确认报价
      this.doConfirmSupplierQuote();
    }
  }

  // 实际执行确认供应商报价的方法
  private doConfirmSupplierQuote() {
    if (!this.quote) return;
    this.quoteService.confirmSupplierQuote(this.quote._id).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('供应商报价确认成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('确认供应商报价失败:', error);
          alert('确认供应商报价失败');
        });
      }
    });
  }

  confirmFinalQuote() {
    if (!this.quote) return;
    
    // 如果有待上传的报价员文件，先上传再确认
    if (this.tempQuoterFiles.length > 0) {
      this.uploadQuoterFiles(this.tempQuoterFiles, () => {
        // 上传成功后执行确认最终报价
        this.doConfirmFinalQuote();
      });
    } else {
      // 没有待上传文件，直接确认最终报价
      this.doConfirmFinalQuote();
    }
  }

  // 实际执行确认最终报价的方法
  private doConfirmFinalQuote() {
    if (!this.quote) return;
    this.quoteService.confirmFinalQuote(this.quote._id).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('最终报价确认成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('确认最终报价失败:', error);
          alert('确认最终报价失败');
        });
      }
    });
  }

  getStatusDisplayName(status: string): string {
    return getStatusDisplayName(status);
  }

  canShowUploadButton(): boolean {
    if (!this.quote) return false;
    
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return this.quote.status === 'pending';
      case 'supplier':
        return ['in_progress', 'rejected', 'supplier_quoted'].includes(this.quote.status);
      case 'quoter':
        return ['pending', 'supplier_quoted', 'in_progress','quoted', 'rejected'].includes(this.quote.status);
      case 'admin':
        return ['pending', 'supplier_quoted', 'in_progress','quoted', 'rejected'].includes(this.quote.status);
      default:
        return false;
    }
  }

  isQuotedStatus(): boolean {
    return !!(this.quote && this.quote.status === 'quoted');
  }

  // 进度条相关方法
  getProgressPercentage(): number {
    if (!this.quote) return 0;
    
    switch (this.quote.status) {
      case 'pending':
        return 20; // 待处理
      case 'in_progress':
        return 40; // 处理中
      case 'supplier_quoted':
        return 60; // 核价中
      case 'rejected':
        return 80; // 不报价
      case 'quoted':
        return 100; // 最终报价完成
      default:
        return 0;
    }
  }

  getProgressText(): string {
    if (!this.quote) return '';
    
    switch (this.quote.status) {
      case 'pending':
        return '待处理';
      case 'in_progress':
        return '处理中';
      case 'supplier_quoted':
        return '核价中';
      case 'quoted':
        return '最终报价完成';
      case 'rejected':
        return '不报价';
      default:
        return '';
    }
  }

  getProgressBarClass(): string {
    if (!this.quote) return 'bg-secondary';
    
    switch (this.quote.status) {
      case 'pending':
        return 'bg-secondary';
      case 'in_progress':
        return 'bg-info';
      case 'supplier_quoted':
        return 'bg-warning';
      case 'quoted':
        return 'bg-success';
      case 'rejected':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }

  getStepClass(step: string): string {
    if (!this.quote) return 'text-muted';
    
    const statusOrder = ['pending', 'in_progress', 'supplier_quoted', 'rejected', 'quoted'];
    const currentIndex = statusOrder.indexOf(this.quote.status);
    const stepIndex = statusOrder.indexOf(step);
    
    if (this.quote.status === 'rejected' && step === 'rejected') {
      return 'text-danger fw-bold';
    }
    
    if (stepIndex < currentIndex) {
      return 'text-success fw-bold';
    } else if (stepIndex === currentIndex) {
      return 'text-primary fw-bold';
    } else {
      return 'text-muted';
    }
  }

  // 群组分配相关方法
  openGroupAssignModal() {
    this.selectedGroupIds = this.quote?.assignedGroups?.map((g: any) => g._id) || [];
    this.showGroupAssignModal = true;
  }

  closeGroupAssignModal() {
    this.showGroupAssignModal = false;
    this.selectedGroupIds = [];
  }

  assignGroupsToQuote() {
    if (!this.quote) return;
    
    this.assigning = true;
    this.quoteService.assignGroupsToQuote(this.quote._id, this.selectedGroupIds).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          this.assigning = false;
          this.closeGroupAssignModal();
          alert('供应商分配成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('供应商分配失败:', error);
          this.assigning = false;
          alert('供应商分配失败');
        });
      }
    });
  }

  onGroupSelectionChange(groupId: string, event: any) {
    if (event.target.checked) {
      this.selectedGroupIds.push(groupId);
    } else {
      const index = this.selectedGroupIds.indexOf(groupId);
      if (index > -1) {
        this.selectedGroupIds.splice(index, 1);
      }
    }
  }

  removeGroupAssignment(groupId: string) {
    if (!this.quote) return;
    
    if (!confirm('确定要移除这个群组分配吗？')) {
      return;
    }
    
    this.quoteService.removeGroupAssignment(this.quote._id, groupId).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('群组分配已移除');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('移除群组分配失败:', error);
          alert('移除群组分配失败');
        });
      }
    });
  }

  // 检查是否可以分配群组
  canAssignGroups(): boolean {
    if (!this.quote) return false;
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    return this.authService.hasRole(['admin', 'quoter']) && ['pending', 'in_progress'].includes(this.quote.status);
  }

  // 获取群组名称列表
  getAssignedGroupNames(): string {
    if (!this.quote?.assignedGroups || this.quote.assignedGroups.length === 0) {
      return '未分配群组';
    }
    
    return this.quote.assignedGroups.map((g: any) => g.name).join(', ');
  }

  ngOnDestroy() {
    // 清理预览URL和模态框
    if (this.previewUrl) {
      window.URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = '';
    }
    
    if (this.previewModal) {
      this.previewModal.dispose();
      this.previewModal = null;
    }
  }

}
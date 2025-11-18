import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { QuoteService, Quote } from '../../services/quote.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-quote-detail',
  templateUrl: './quote-detail.component.html',
  styleUrls: ['./quote-detail.component.scss']
})
export class QuoteDetailComponent implements OnInit {
  quote: Quote | null = null;
  loading = true;
  error = '';
  quoters: any[] = [];
  editMode = false;
  quoteForm: any = {};
  uploading = false;
  uploadProgress = 0;

  constructor(
    private route: ActivatedRoute,
    private quoteService: QuoteService,
    public authService: AuthService,
    private userService: UserService
  ) { }

  ngOnInit() {
    const quoteId = this.route.snapshot.paramMap.get('id');
    if (quoteId) {
      this.loadQuote(quoteId);
      if (this.authService.hasRole('admin')) {
        this.loadQuoters();
      }
    }
  }

  loadQuote(id: string) {
    this.loading = true;
    this.quoteService.getQuoteById(id).subscribe({
      next: (quote) => {
        this.quote = quote;
        this.quoteForm = { ...quote };
        this.loading = false;
      },
      error: () => {
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

  getStatusDisplayName(status: string): string {
    const statusNames: { [key: string]: string } = {
      'pending': '待处理',
      'in_progress': '处理中',
      'completed': '已完成',
      'cancelled': '已取消',
      'rejected': '不报价'
    };
    return statusNames[status] || status;
  }

  downloadFile(fileType: string) {
    if (!this.quote) return;
    
    // 根据用户角色和询价单状态决定下载哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时下载原文件，已报价时下载报价文件
      actualFileType = this.quote.status === 'completed' ? 'quoter' : 'customer';
    }
    
    this.quoteService.downloadFile(this.quote._id, actualFileType).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.quote?.title}_${actualFileType}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('下载文件失败:', error);
        alert('下载文件失败');
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // 检查文件类型
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('请选择Excel文件 (.xlsx 或 .xls)');
        event.target.value = '';
        return;
      }
      
      // 检查文件大小 (10MB限制)
      if (file.size > 10 * 1024 * 1024) {
        alert('文件大小不能超过10MB');
        event.target.value = '';
        return;
      }
      
      this.uploadQuoterFile(file);
    }
  }

  uploadQuoterFile(file: File) {
    if (!this.quote) return;
    
    this.uploading = true;
    this.uploadProgress = 0;
    
    const formData = new FormData();
    formData.append('quoterFile', file);
    
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
      this.uploading = false;
      this.uploadProgress = 0;
      
      if (xhr.status === 200) {
        try {
          const updatedQuote = JSON.parse(xhr.responseText);
          this.quote = updatedQuote;
          alert('报价文件上传成功');
        } catch (error) {
          console.error('解析响应失败:', error);
          alert('上传响应解析失败');
        }
      } else {
        console.error('上传失败:', xhr.status, xhr.responseText);
        alert('上传报价文件失败');
      }
    });
    
    // 监听错误
    xhr.addEventListener('error', () => {
      this.uploading = false;
      this.uploadProgress = 0;
      console.error('网络错误');
      alert('网络错误，上传失败');
    });
    
    // 监听超时
    xhr.addEventListener('timeout', () => {
      this.uploading = false;
      this.uploadProgress = 0;
      console.error('上传超时');
      alert('上传超时，请重试');
    });
    
    // 配置请求
    xhr.timeout = 60000; // 60秒超时
    xhr.open('PUT', `${environment.apiUrl}/quotes/${this.quote._id}`);
    
    // 添加认证头
    const token = localStorage.getItem('token');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    
    // 发送请求
    xhr.send(formData);
  }

  deleteQuoterFile() {
    if (!this.quote || !this.quote.quoterFile) return;
    
    if (confirm('确定要删除报价文件吗？')) {
      const formData = new FormData();
      formData.append('quoterFile', ''); // 空值表示删除
      
      this.quoteService.updateQuote(this.quote._id, formData).subscribe({
        next: (quote) => {
          this.quote = quote;
          alert('报价文件删除成功');
        },
        error: (error) => {
          console.error('删除报价文件失败:', error);
          alert('删除报价文件失败');
        }
      });
    }
  }

  assignToQuoter(quoterId: string) {
    if (!this.quote) return;
    
    this.quoteService.assignQuote(this.quote._id, quoterId).subscribe({
      next: (quote) => {
        this.quote = quote;
        alert('分配成功');
      },
      error: (error) => {
        console.error('分配失败:', error);
        alert('分配失败');
      }
    });
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.quoteForm = { ...this.quote };
    }
  }

  saveChanges() {
    if (!this.quote) return;
    
    const formData = new FormData();
    Object.keys(this.quoteForm).forEach(key => {
      if (key !== '_id' && key !== 'customer' && key !== 'quoter') {
        formData.append(key, this.quoteForm[key]);
      }
    });

    this.quoteService.updateQuote(this.quote._id, formData).subscribe({
      next: (quote) => {
        this.quote = quote;
        this.editMode = false;
        alert('更新成功');
      },
      error: (error) => {
        console.error('更新失败:', error);
        alert('更新失败');
      }
    });
  }

  canEdit(): boolean {
    if (!this.quote) return false;
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    if (user.role === 'customer') {
      return this.quote.customer._id === user.id;
    }
    
    if (user.role === 'quoter') {
      return this.quote.status === 'pending' || this.quote.status === 'in_progress';
    }
    
    return true; // admin can edit all
  }

  canReject(): boolean {
    if (!this.quote) return false;
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    // 客户不能拒绝报价
    if (user.role === 'customer') {
      return false;
    }
    
    // 只有待处理或处理中的询价单可以被拒绝
    return this.quote.status === 'pending' || this.quote.status === 'in_progress';
  }

  rejectQuote() {
    if (!this.quote) return;
    
    const reason = prompt('请填写不予报价的理由：');
    if (!reason || reason.trim() === '') {
      return;
    }
    
    this.quoteService.rejectQuote(this.quote._id, reason.trim()).subscribe({
      next: (quote) => {
        this.quote = quote;
        alert('已标记为不予报价');
      },
      error: (error) => {
        console.error('不予报价失败:', error);
        alert('不予报价失败');
      }
    });
  }
}
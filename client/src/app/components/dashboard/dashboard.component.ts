import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { QuoteService, Quote } from '../../services/quote.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  quotes: Quote[] = [];
  loading = true;
  error = '';

  constructor(
    public authService: AuthService,
    private quoteService: QuoteService
  ) { }

  ngOnInit() {
    this.loadQuotes();
  }

  loadQuotes() {
    this.loading = true;
    this.quoteService.getAllQuotes().subscribe({
      next: (quotes) => {
        this.quotes = quotes;
        this.loading = false;
      },
      error: (error) => {
        this.error = '加载询价单失败';
        this.loading = false;
        console.error(error);
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



  getQuoteCountByStatus(status: string): number {
    return this.quotes.filter(quote => quote.status === status).length;
  }

  canEditQuote(quote: Quote): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    if (user.role === 'customer') {
      return quote.customer._id === user.id;
    }
    
    if (user.role === 'quoter') {
      return quote.status === 'pending' || quote.status === 'in_progress';
    }
    
    return true; // admin can edit all
  }

  canDeleteQuote(quote: Quote): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    // 客户只能删除自己创建的询价单
    if (user.role === 'customer') {
      return quote.customer._id === user.id;
    }
    
    // 管理员可以删除所有询价单
    if (user.role === 'admin') {
      return true;
    }
    
    return false; // 报价员不能删除询价单
  }

  deleteQuote(quote: Quote) {
    if (confirm(`确定要删除询价单"${quote.title}"吗？此操作不可撤销。`)) {
      this.quoteService.deleteQuote(quote._id).subscribe({
        next: () => {
          // 从列表中移除已删除的询价单
          this.quotes = this.quotes.filter(q => q._id !== quote._id);
        },
        error: (error) => {
          console.error('删除询价单失败:', error);
          alert('删除询价单失败，请重试');
        }
      });
    }
  }

  downloadFile(quoteId: string, fileType: string) {
    this.quoteService.downloadFile(quoteId, fileType).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quote_${quoteId}_${fileType}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('下载文件失败:', error);
        alert('下载文件失败');
      }
    });
  }
}
import { Component, OnInit } from '@angular/core';
import { QuoteService, Quote } from '../../services/quote.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-quote-list',
  templateUrl: './quote-list.component.html',
  styleUrls: ['./quote-list.component.scss']
})
export class QuoteListComponent implements OnInit {
  quotes: Quote[] = [];
  loading = true;
  error = '';

  constructor(
    private quoteService: QuoteService,
    public authService: AuthService
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
}
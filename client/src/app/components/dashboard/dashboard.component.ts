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
        console.error('加载询价单失败:', error);
        this.loading = false;
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

  getRecentQuotes(): Quote[] {
    return this.quotes.slice(0, 5);
  }

  getQuoteCountByStatus(status: string): number {
    return this.quotes.filter(quote => quote.status === status).length;
  }
}
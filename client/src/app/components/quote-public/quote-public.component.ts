import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { QuoteService, Quote } from '../../services/quote.service';
import { ConfigService } from '../../services/config.service';


@Component({
  selector: 'app-quote-public',
  templateUrl: './quote-public.component.html',
  styleUrls: ['./quote-public.component.scss']
})
export class QuotePublicComponent implements OnInit {
  quote: any = null;
  loading = true;
  error = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private quoteService: QuoteService,
    private configService: ConfigService
  ) {}

  ngOnInit() {
    const quoteId = this.route.snapshot.paramMap.get('id');
    if (quoteId) {
      this.loadPublicQuote(quoteId);
    }
  }

  loadPublicQuote(id: string) {
    this.loading = true;
    // 调用公开访问的API端点
    this.quoteService.getPublicQuote(id).subscribe({
      next: (response) => {
        this.quote = response.quote;
        this.loading = false;
      },
      error: (error) => {
        if (error.status === 403) {
          // 如果询价单已处理，重定向到登录页面
          this.error = error.error?.message || '该询价单已处理';
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 3000);
        } else {
          this.error = error.error?.message || '加载询价单失败';
        }
        this.loading = false;
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  downloadCustomerFile() {
    if (this.quote?.customerFiles?.length > 0) {
      window.open(`${this.configService.buildApiUrl('/quotes/public')}/${this.quote._id}/download/customer`, '_blank');
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
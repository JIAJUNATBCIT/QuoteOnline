import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';


export interface QuoteFile {
  filename: string;
  originalName: string;
  path: string;
  size: number;
  uploadedAt?: Date;
}

export interface Quote {
  _id: string;
  quoteNumber: string;
  customer: any;
  quoter?: any;
  supplier?: any;
  assignedGroups?: any[];
  title: string;
  description?: string;
  customerFiles?: QuoteFile[];
  quoterFiles?: QuoteFile[];
  supplierFiles?: QuoteFile[];

  status: 'pending' | 'supplier_quoted' | 'in_progress' | 'quoted' | 'cancelled' | 'rejected';
  quoterMessage?: string;
  rejectReason?: string;
  price?: number;
  currency?: string;
  validUntil?: Date;
  urgent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class QuoteService {
  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) { }

  getAllQuotes(): Observable<Quote[]> {
    const url = this.configService.buildApiUrl('/quotes');
    return this.http.get<Quote[]>(url);
  }

  getQuoteById(id: string): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}`);
    return this.http.get<Quote>(url);
  }

  getPublicQuote(id: string): Observable<any> {
    const url = this.configService.buildApiUrl(`/quotes/public/${id}`);
    return this.http.get<any>(url);
  }

  createQuote(quoteData: FormData): Observable<Quote> {
    const url = this.configService.buildApiUrl('/quotes');
    return this.http.post<Quote>(url, quoteData);
  }

  updateQuote(id: string, quoteData: FormData): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}`);
    return this.http.put<Quote>(url, quoteData);
  }

  assignQuote(id: string, quoterId: string): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}/assign`);
    return this.http.patch<Quote>(url, { quoterId });
  }

  assignSupplier(id: string, supplierId: string): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}/assign-supplier`);
    return this.http.patch<Quote>(url, { supplierId });
  }



  rejectQuote(id: string, rejectReason: string): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}/reject`);
    return this.http.patch<Quote>(url, { rejectReason });
  }

  downloadFile(quoteId: string, fileType: string, fileIndex?: number): Observable<Blob> {
    const path = fileIndex !== undefined 
      ? `/quotes/${quoteId}/download/${fileType}-${fileIndex}`
      : `/quotes/${quoteId}/download/${fileType}`;
    const url = this.configService.buildApiUrl(path);
    return this.http.get(url, {
      responseType: 'blob'
    });
  }

  downloadFilesBatch(quoteId: string, fileType: string): Observable<Blob> {
    const url = this.configService.buildApiUrl(`/quotes/${quoteId}/download/${fileType}/batch`);
    return this.http.get(url, {
      responseType: 'blob'
    });
  }

  deleteQuote(id: string): Observable<void> {
    const url = this.configService.buildApiUrl(`/quotes/${id}`);
    return this.http.delete<void>(url);
  }

  confirmSupplierQuote(id: string): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}/confirm-supplier-quote`);
    return this.http.patch<Quote>(url, {});
  }

  confirmFinalQuote(id: string): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}/confirm-final-quote`);
    return this.http.patch<Quote>(url, {});
  }

  // 群组分配相关方法
  assignGroupsToQuote(id: string, groupIds: string[]): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}/assign-groups`);
    return this.http.patch<Quote>(url, { groupIds });
  }

  removeGroupAssignment(id: string, groupId: string): Observable<Quote> {
    const url = this.configService.buildApiUrl(`/quotes/${id}/groups/${groupId}`);
    return this.http.delete<Quote>(url);
  }
}
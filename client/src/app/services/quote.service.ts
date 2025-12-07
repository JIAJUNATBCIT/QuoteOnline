import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


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
  constructor(private http: HttpClient) { }

  getAllQuotes(): Observable<Quote[]> {
    return this.http.get<Quote[]>(`/api/quotes`);
  }

  getQuoteById(id: string): Observable<Quote> {
    return this.http.get<Quote>(`/api/quotes/${id}`);
  }

  getPublicQuote(id: string): Observable<any> {
    return this.http.get<any>(`/api/quotes/public/${id}`);
  }

  createQuote(quoteData: FormData): Observable<Quote> {
    return this.http.post<Quote>(`/api/quotes`, quoteData);
  }

  updateQuote(id: string, quoteData: FormData): Observable<Quote> {
    return this.http.put<Quote>(`/api/quotes/${id}`, quoteData);
  }

  assignQuote(id: string, quoterId: string): Observable<Quote> {
    return this.http.patch<Quote>(`/api/quotes/${id}/assign`, { quoterId });
  }

  assignSupplier(id: string, supplierId: string): Observable<Quote> {
    return this.http.patch<Quote>(`/api/quotes/${id}/assign-supplier`, { supplierId });
  }



  rejectQuote(id: string, rejectReason: string): Observable<Quote> {
    return this.http.patch<Quote>(`/api/quotes/${id}/reject`, { rejectReason });
  }

  downloadFile(quoteId: string, fileType: string, fileIndex?: number): Observable<Blob> {
    const url = fileIndex !== undefined 
      ? `/api/quotes/${quoteId}/download/${fileType}-${fileIndex}`
      : `/api/quotes/${quoteId}/download/${fileType}`;
    return this.http.get(url, {
      responseType: 'blob'
    });
  }

  downloadFilesBatch(quoteId: string, fileType: string): Observable<Blob> {
    return this.http.get(`/api/quotes/${quoteId}/download/${fileType}/batch`, {
      responseType: 'blob'
    });
  }

  deleteQuote(id: string): Observable<void> {
    return this.http.delete<void>(`/api/quotes/${id}`);
  }

  confirmSupplierQuote(id: string): Observable<Quote> {
    return this.http.patch<Quote>(`/api/quotes/${id}/confirm-supplier-quote`, {});
  }

  confirmFinalQuote(id: string): Observable<Quote> {
    return this.http.patch<Quote>(`/api/quotes/${id}/confirm-final-quote`, {});
  }

  // 群组分配相关方法
  assignGroupsToQuote(id: string, groupIds: string[]): Observable<Quote> {
    return this.http.patch<Quote>(`/api/quotes/${id}/assign-groups`, { groupIds });
  }

  removeGroupAssignment(id: string, groupId: string): Observable<Quote> {
    return this.http.delete<Quote>(`/api/quotes/${id}/groups/${groupId}`);
  }
}
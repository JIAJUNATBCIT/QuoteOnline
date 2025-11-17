import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface QuoteFile {
  filename: string;
  originalName: string;
  path: string;
  size: number;
}

export interface Quote {
  _id: string;
  customer: any;
  quoter?: any;
  title: string;
  description?: string;
  customerFile?: QuoteFile;
  quoterFile?: QuoteFile;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'rejected';
  customerMessage?: string;
  quoterMessage?: string;
  rejectReason?: string;
  price?: number;
  currency?: string;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class QuoteService {
  constructor(private http: HttpClient) { }

  getAllQuotes(): Observable<Quote[]> {
    return this.http.get<Quote[]>(`${environment.apiUrl}/quotes`);
  }

  getQuoteById(id: string): Observable<Quote> {
    return this.http.get<Quote>(`${environment.apiUrl}/quotes/${id}`);
  }

  createQuote(quoteData: FormData): Observable<Quote> {
    return this.http.post<Quote>(`${environment.apiUrl}/quotes`, quoteData);
  }

  updateQuote(id: string, quoteData: FormData): Observable<Quote> {
    return this.http.put<Quote>(`${environment.apiUrl}/quotes/${id}`, quoteData);
  }

  assignQuote(id: string, quoterId: string): Observable<Quote> {
    return this.http.patch<Quote>(`${environment.apiUrl}/quotes/${id}/assign`, { quoterId });
  }

  rejectQuote(id: string, rejectReason: string): Observable<Quote> {
    return this.http.patch<Quote>(`${environment.apiUrl}/quotes/${id}/reject`, { rejectReason });
  }

  downloadFile(quoteId: string, fileType: string): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/quotes/${quoteId}/download/${fileType}`, {
      responseType: 'blob'
    });
  }
}